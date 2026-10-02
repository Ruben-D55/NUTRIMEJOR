import {
  calculateAdequacy,
  calculateMealDistribution,
  calculateRequirements,
  findRestrictionViolation,
  generatorInput,
  nutrientsForCatalogItem,
  publishInput,
  recordId,
  recordInput,
  reviewInput,
  substitutionInput,
} from "../domain/record.js";
import { conflict, DomainError, forbidden, notFound } from "../domain/errors.js";

function assertAccess(actor, patientId = null, write = false) {
  if (actor.organizationRole === "ASSISTANT") throw forbidden();
  if (actor.organizationRole === "PATIENT"
    && (write || !patientId || !actor.patientId || actor.patientId.toLowerCase() !== String(patientId).toLowerCase())) throw forbidden();
}

export class RecordService {
  constructor(repository, catalogs, entitlements = null) {
    this.repository = repository;
    this.catalogs = catalogs;
    this.entitlements = entitlements;
  }

  list(actor, patientId) {
    const parsed=patientId ? recordId.parse(patientId) : null; assertAccess(actor, parsed);
    return this.repository.list(actor, parsed);
  }

  async get(actor, id) {
    const item = await this.repository.get(actor, recordId.parse(id));
    if (!item) throw notFound();
    assertAccess(actor, item.patientId);
    return item;
  }

  async create(actor, input, context = {}) {
    assertAccess(actor, null, true);
    const parsed = recordInput.parse(input);
    const requirements = calculateRequirements(parsed.requirement);
    const mealDistribution = calculateMealDistribution(parsed.mealDistribution, requirements);
    const days = await Promise.all(parsed.days.map(async (day) => ({
      ...day,
      meals: await Promise.all(day.meals.map(async (meal) => ({
        ...meal,
        items: await Promise.all(meal.items.map(async (item) => {
          const snapshot = item.catalogType === "food"
            ? await this.catalogs.getFood(item.catalogId, context)
            : await this.catalogs.getRecipe(item.catalogId, context);
          const violation = findRestrictionViolation(snapshot, parsed.restrictions);
          if (violation) {
            throw new DomainError(
              `El elemento ${snapshot.name} infringe la restricción ${violation.value}.`,
              422,
              "PLAN_RESTRICTION_VIOLATION",
            );
          }
          return {
            ...item,
            catalogVersion: snapshot.version,
            catalogSnapshot: snapshot,
            nutrients: nutrientsForCatalogItem(snapshot, item.catalogType, item.amount),
          };
        })),
      }))),
    })));
    return this.repository.create(actor, {
      ...parsed,
      requirements,
      mealDistribution,
      days: calculateAdequacy(days, requirements, parsed.requirement.nutrientTargets),
    });
  }

  async publish(actor, id, input) {
    assertAccess(actor);
    const result = await this.repository.publish(
      actor,
      recordId.parse(id),
      publishInput.parse(input).expectedVersion,
    );
    if (!result) throw notFound();
    if (result.error === "review_required") {
      throw new DomainError("El plan generado requiere aprobación profesional antes de publicarse.", 409, "PROFESSIONAL_REVIEW_REQUIRED");
    }
    if (result.error) throw conflict();
    return result;
  }

  versions(actor, id) {
    assertAccess(actor);
    return this.repository.versions(actor, recordId.parse(id));
  }

  async generate(actor, input, context = {}) {
    assertAccess(actor);
    const parsed = generatorInput.parse(input);
    const requirements = calculateRequirements(parsed.requirement);
    const snapshots = await Promise.all(parsed.candidateItems.map(async (item) => ({
      ...item,
      snapshot: item.catalogType === "food"
        ? await this.catalogs.getFood(item.catalogId, context)
        : await this.catalogs.getRecipe(item.catalogId, context),
    })));
    const eligible = snapshots.filter((item) => !findRestrictionViolation(item.snapshot, parsed.restrictions));
    if (!eligible.length) {
      throw new DomainError("Ningún candidato cumple las restricciones del paciente.", 422, "NO_SAFE_GENERATOR_CANDIDATES");
    }
    await this.entitlements.consume(actor.organizationId, "planning.generator", 1, context.requestId);
    const distribution = calculateMealDistribution(parsed.mealDistribution, requirements);
    const days = Array.from({ length: parsed.daysCount }, (_, dayIndex) => ({
      label: `Día ${dayIndex + 1}`,
      meals: distribution.map((meal, mealIndex) => {
        const chosen = eligible[(dayIndex * distribution.length + mealIndex) % eligible.length];
        const energy = nutrientsForCatalogItem(
          chosen.snapshot,
          chosen.catalogType,
          chosen.catalogType === "food" ? 100 : 1,
        ).find((item) => item.nutrientCode === "energy_kcal")?.amount || 1;
        const amount = Number(Math.max(0.1, meal.targetKcal / energy * (chosen.catalogType === "food" ? 100 : 1)).toFixed(2));
        return {
          mealType: meal.mealType,
          items: [{
            catalogType: chosen.catalogType,
            catalogId: chosen.catalogId,
            amount,
            amountUnit: chosen.catalogType === "food" ? "g" : "serving",
            notes: "Propuesta automática pendiente de revisión profesional",
          }],
        };
      }),
    }));
    const plan = await this.create(actor, {
      patientId: parsed.patientId,
      title: parsed.title,
      validFrom: parsed.validFrom,
      validTo: parsed.validTo,
      requirement: parsed.requirement,
      mealDistribution: parsed.mealDistribution,
      restrictions: parsed.restrictions,
      days,
    }, context);
    await this.repository.recordGeneration(actor, {
      patientId: parsed.patientId,
      planId: plan.id,
      algorithmVersion: "balanced-energy-1.0.0",
      input: parsed,
      result: plan,
    });
    return plan;
  }

  async generateSport(actor, input, context = {}) {
    assertAccess(actor);
    await this.entitlements.assert(actor.organizationId, "planning.sport", context.requestId);
    const parsed = generatorInput.parse(input);
    const mealTypes = new Set(parsed.mealDistribution.map((item) => item.mealType.toLowerCase()));
    for (const required of ["pre_training", "intra_training", "post_training"]) {
      if (!mealTypes.has(required)) {
        throw new DomainError(
          "El plan Sport debe incluir pre_training, intra_training y post_training.",
          400,
          "SPORT_MEAL_DISTRIBUTION_REQUIRED",
        );
      }
    }
    return this.generate(actor, parsed, context);
  }

  async substitutions(actor, input, context = {}) {
    assertAccess(actor);
    const parsed = substitutionInput.parse(input);
    const originalSnapshot = parsed.original.catalogType === "food"
      ? await this.catalogs.getFood(parsed.original.catalogId, context)
      : await this.catalogs.getRecipe(parsed.original.catalogId, context);
    const originalNutrients = nutrientsForCatalogItem(
      originalSnapshot,
      parsed.original.catalogType,
      parsed.original.amount,
    );
    const important = ["energy_kcal", "protein_g", "carbohydrate_g", "fat_g"];
    const alternatives = [];
    for (const candidate of parsed.candidates) {
      const snapshot = candidate.catalogType === "food"
        ? await this.catalogs.getFood(candidate.catalogId, context)
        : await this.catalogs.getRecipe(candidate.catalogId, context);
      if (findRestrictionViolation(snapshot, parsed.restrictions)) continue;
      const baseAmount = candidate.catalogType === "food" ? 100 : 1;
      const nutrients = nutrientsForCatalogItem(snapshot, candidate.catalogType, baseAmount);
      const originalEnergy = originalNutrients.find((item) => item.nutrientCode === "energy_kcal")?.amount || 1;
      const candidateEnergy = nutrients.find((item) => item.nutrientCode === "energy_kcal")?.amount || 1;
      const factor = originalEnergy / candidateEnergy;
      const amount = Number((baseAmount * factor).toFixed(2));
      const adjusted = nutrientsForCatalogItem(snapshot, candidate.catalogType, amount);
      const score = important.reduce((sum, code) => {
        const expected = originalNutrients.find((item) => item.nutrientCode === code)?.amount || 0;
        const actual = adjusted.find((item) => item.nutrientCode === code)?.amount || 0;
        return sum + (expected ? Math.abs(actual - expected) / expected : 0);
      }, 0);
      alternatives.push({
        ...candidate,
        name: snapshot.name,
        amount,
        amountUnit: candidate.catalogType === "food" ? "g" : "serving",
        similarityScore: Number(Math.max(0, 100 - score / important.length * 100).toFixed(2)),
        nutrients: adjusted,
      });
    }
    alternatives.sort((left, right) => right.similarityScore - left.similarityScore);
    await this.repository.recordSubstitutions(actor, parsed, alternatives);
    return { algorithmVersion: "nutrient-similarity-1.0.0", original: parsed.original, alternatives };
  }

  async shoppingList(actor, id) {
    assertAccess(actor);
    const plan = await this.get(actor, id);
    const totals = new Map();
    for (const day of plan.days || []) {
      for (const meal of day.meals || []) {
        for (const item of meal.items || []) {
          const name = item.catalogSnapshot?.name || item.catalogId;
          const key = `${name}|${item.amountUnit}`;
          const current = totals.get(key) || { name, unit: item.amountUnit, amount: 0 };
          current.amount += Number(item.amount);
          totals.set(key, current);
        }
      }
    }
    const items = [...totals.values()].map((item) => ({ ...item, amount: Number(item.amount.toFixed(2)) }));
    return this.repository.createShoppingList(actor, plan, items);
  }

  async review(actor, id, input) {
    assertAccess(actor);
    const result = await this.repository.review(actor, recordId.parse(id), reviewInput.parse(input));
    if (!result) throw notFound();
    return result;
  }
}

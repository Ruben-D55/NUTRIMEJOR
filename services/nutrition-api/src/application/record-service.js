import { analyzeRecall, completeInput, recordId, recordInput } from "../domain/record.js";
import { conflict, forbidden, notFound } from "../domain/errors.js";

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
    if (parsed.foodFrequency) {
      await this.entitlements.consume(actor.organizationId, "nutrition.food_frequency", context.requestId);
    }
    let recall = parsed.recall24h;
    if (recall) {
      if (!this.catalogs) throw new Error("CatalogsClient no configurado.");
      recall = {
        ...recall,
        meals: await Promise.all(recall.meals.map(async (meal) => ({
          ...meal,
          items: await Promise.all(meal.items.map(async (item) => {
            const food = await this.catalogs.getFood(item.foodId, context.authorization, context.requestId);
            return {
              ...item,
              foodSnapshot: {
                id: food.id,
                name: food.name,
                category: food.category,
                version: food.version,
                sourceName: food.sourceName,
                sourceReference: food.sourceReference,
                licenseName: food.licenseName,
                nutrients: food.nutrients,
              },
            };
          })),
        }))),
      };
    }
    return this.repository.create(actor, {
      ...parsed,
      recall24h: recall,
      analysis: analyzeRecall(recall),
    });
  }

  async complete(actor, id, input) {
    assertAccess(actor, null, true);
    const result = await this.repository.complete(
      actor,
      recordId.parse(id),
      completeInput.parse(input).expectedVersion,
    );
    if (!result) throw notFound();
    if (result.error) throw conflict();
    return result;
  }
}

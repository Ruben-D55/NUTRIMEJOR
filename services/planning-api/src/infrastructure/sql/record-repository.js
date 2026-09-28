import { config } from "../../config.js";
import { database, sql } from "./database.js";

function json(value, fallback) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function number(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patientId,
    title: row.title,
    status: row.status,
    version: row.version,
    validFrom: row.validFrom,
    validTo: row.validTo,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const planSelect = `SELECT ${config.idColumn} AS id, IdPaciente AS patientId,
  Titulo AS title, Estado AS status, Version AS version, FechaInicio AS validFrom,
  FechaFin AS validTo, PublicadoEn AS publishedAt,
  FechaCreacion AS createdAt, FechaActualizacion AS updatedAt
  FROM ${config.table}`;

export class SqlRecordRepository {
  async list(actor, patientId) {
    const pool = await database();
    const request = pool.request().input("organizationId", sql.UniqueIdentifier, actor.organizationId);
    let filter = "";
    if (patientId) {
      request.input("patientId", sql.UniqueIdentifier, patientId);
      filter = " AND IdPaciente=@patientId";
    }
    const result = await request.query(`${planSelect}
      WHERE IdOrganizacion=@organizationId${filter}
      ORDER BY FechaActualizacion DESC`);
    return result.recordset.map(mapPlan);
  }

  async get(actor, id) {
    const pool = await database();
    const request = () => pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id);
    const [base, profile, energy, macros, targets, distribution, restrictions, days, meals, items, adequacy] = await Promise.all([
      request().query(`${planSelect} WHERE IdOrganizacion=@organizationId AND ${config.idColumn}=@id`),
      request().query(`SELECT IdRequirementProfile AS id, WeightKg AS weightKg,
        HeightCm AS heightCm, AgeYears AS ageYears, Sex AS sex,
        ActivityFactor AS activityFactor, ThermicEffectPercent AS thermicEffectPercent,
        InputsSnapshot AS inputsSnapshot, CreatedAt AS createdAt
        FROM RequirementProfiles WHERE IdOrganizacion=@organizationId AND IdMealPlan=@id`),
      request().query(`SELECT calculations.FormulaCode AS formulaCode,
        calculations.FormulaVersion AS formulaVersion, calculations.Inputs AS inputs,
        calculations.BasalEnergy AS basalEnergy, calculations.ActivityEnergy AS activityEnergy,
        calculations.ThermicEffectEnergy AS thermicEffectEnergy,
        calculations.TotalEnergy AS totalEnergy, calculations.Unit AS unit,
        calculations.Rounding AS rounding, definitions.Source AS source
        FROM EnergyCalculations calculations
        JOIN RequirementProfiles profile ON profile.IdRequirementProfile=calculations.IdRequirementProfile
        JOIN PlanningFormulaDefinitions definitions
          ON definitions.Code=calculations.FormulaCode AND definitions.Version=calculations.FormulaVersion
        WHERE profile.IdOrganizacion=@organizationId AND profile.IdMealPlan=@id`),
      request().query(`SELECT targets.NutrientCode AS nutrientCode,
        targets.PercentEnergy AS percentEnergy, targets.Kcal AS kcal,
        targets.Grams AS grams, targets.GramsPerKg AS gramsPerKg
        FROM MacroTargets targets JOIN RequirementProfiles profile
          ON profile.IdRequirementProfile=targets.IdRequirementProfile
        WHERE profile.IdOrganizacion=@organizationId AND profile.IdMealPlan=@id
        ORDER BY targets.NutrientCode`),
      request().query(`SELECT targets.NutrientCode AS nutrientCode,
        targets.TargetAmount AS targetAmount, targets.Unit AS unit
        FROM NutrientTargets targets JOIN RequirementProfiles profile
          ON profile.IdRequirementProfile=targets.IdRequirementProfile
        WHERE profile.IdOrganizacion=@organizationId AND profile.IdMealPlan=@id
        ORDER BY targets.NutrientCode`),
      request().query(`SELECT distribution.MealType AS mealType,
        distribution.PercentEnergy AS percentEnergy, distribution.TargetKcal AS targetKcal,
        distribution.TargetCarbohydrateG AS targetCarbohydrateG,
        distribution.TargetProteinG AS targetProteinG, distribution.TargetFatG AS targetFatG,
        distribution.Position AS position
        FROM MealDistributions distribution JOIN RequirementProfiles profile
          ON profile.IdRequirementProfile=distribution.IdRequirementProfile
        WHERE profile.IdOrganizacion=@organizationId AND profile.IdMealPlan=@id
        ORDER BY distribution.Position`),
      request().query(`SELECT IdPlanRestriction AS id, RestrictionType AS type,
        Value AS value, FoodId AS foodId FROM PlanRestrictions WHERE IdMealPlan=@id`),
      request().query(`SELECT IdMenuDay AS id, DayDate AS date, Label AS label,
        Position AS position FROM MenuDays WHERE IdMealPlan=@id ORDER BY Position`),
      request().query(`SELECT meals.IdMenuMeal AS id, meals.IdMenuDay AS dayId,
        meals.MealType AS mealType, CONVERT(VARCHAR(5), meals.MealTime, 108) AS time,
        meals.Position AS position, meals.Notes AS notes
        FROM MenuMeals meals JOIN MenuDays days ON days.IdMenuDay=meals.IdMenuDay
        WHERE days.IdMealPlan=@id ORDER BY days.Position, meals.Position`),
      request().query(`SELECT items.IdMenuItem AS id, items.IdMenuMeal AS mealId,
        items.CatalogType AS catalogType, items.CatalogId AS catalogId,
        items.CatalogVersion AS catalogVersion, items.CatalogSnapshot AS catalogSnapshot,
        items.Amount AS amount, items.AmountUnit AS amountUnit,
        items.NutrientSnapshot AS nutrients, items.Position AS position,
        items.Notes AS notes FROM MenuItems items
        JOIN MenuMeals meals ON meals.IdMenuMeal=items.IdMenuMeal
        JOIN MenuDays days ON days.IdMenuDay=meals.IdMenuDay
        WHERE days.IdMealPlan=@id ORDER BY days.Position, meals.Position, items.Position`),
      request().query(`SELECT analysis.IdMenuDay AS dayId,
        analysis.CalculationVersion AS calculationVersion, analysis.Totals AS totals,
        analysis.Targets AS targets, analysis.Adequacy AS adequacy,
        analysis.CalculatedAt AS calculatedAt FROM MenuAdequacySnapshots analysis
        JOIN MenuDays days ON days.IdMenuDay=analysis.IdMenuDay
        WHERE days.IdMealPlan=@id`),
    ]);
    const plan = mapPlan(base.recordset[0]);
    if (!plan) return null;
    const profileRow = profile.recordset[0];
    const energyRow = energy.recordset[0];
    const itemsByMeal = Map.groupBy(items.recordset, (item) => String(item.mealId));
    const mealsByDay = Map.groupBy(meals.recordset, (meal) => String(meal.dayId));
    const analysisByDay = new Map(adequacy.recordset.map((item) => [String(item.dayId), item]));
    return {
      ...plan,
      requirement: profileRow ? {
        ...profileRow,
        weightKg: number(profileRow.weightKg),
        heightCm: number(profileRow.heightCm),
        activityFactor: number(profileRow.activityFactor),
        thermicEffectPercent: number(profileRow.thermicEffectPercent),
        inputsSnapshot: json(profileRow.inputsSnapshot, {}),
        energy: energyRow ? {
          ...energyRow,
          inputs: json(energyRow.inputs, {}),
          basalEnergy: number(energyRow.basalEnergy),
          activityEnergy: number(energyRow.activityEnergy),
          thermicEffectEnergy: number(energyRow.thermicEffectEnergy),
          totalEnergy: number(energyRow.totalEnergy),
        } : null,
        macros: macros.recordset.map((item) => ({
          ...item,
          percentEnergy: number(item.percentEnergy),
          kcal: number(item.kcal),
          grams: number(item.grams),
          gramsPerKg: number(item.gramsPerKg),
        })),
        nutrientTargets: targets.recordset.map((item) => ({ ...item, targetAmount: number(item.targetAmount) })),
      } : null,
      mealDistribution: distribution.recordset.map((item) => ({
        ...item,
        percentEnergy: number(item.percentEnergy),
        targetKcal: number(item.targetKcal),
        targetCarbohydrateG: number(item.targetCarbohydrateG),
        targetProteinG: number(item.targetProteinG),
        targetFatG: number(item.targetFatG),
      })),
      restrictions: restrictions.recordset,
      days: days.recordset.map((day) => {
        const analysis = analysisByDay.get(String(day.id));
        return {
          ...day,
          meals: (mealsByDay.get(String(day.id)) || []).map((meal) => ({
            ...meal,
            items: (itemsByMeal.get(String(meal.id)) || []).map((item) => ({
              ...item,
              amount: number(item.amount),
              catalogSnapshot: json(item.catalogSnapshot, {}),
              nutrients: json(item.nutrients, []),
            })),
          })),
          analysis: analysis ? {
            calculationVersion: analysis.calculationVersion,
            totals: json(analysis.totals, []),
            targets: json(analysis.targets, []),
            adequacy: json(analysis.adequacy, []),
            calculatedAt: analysis.calculatedAt,
          } : null,
        };
      }),
    };
  }

  async create(actor, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const inserted = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("owner", sql.Int, actor.id)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("title", sql.NVarChar(200), input.title)
        .input("validFrom", sql.Date, input.validFrom)
        .input("validTo", sql.Date, input.validTo)
        .input("data", sql.NVarChar(sql.MAX), JSON.stringify({
          formulaCode: input.requirements.formulaCode,
          formulaVersion: input.requirements.formulaVersion,
          totalEnergy: input.requirements.totalEnergy,
          days: input.days.length,
        }))
        .query(`INSERT INTO MealPlans
                  (IdOrganizacion, IdNutricionista, IdPaciente, Titulo, Estado,
                   Datos, FechaInicio, FechaFin)
                OUTPUT INSERTED.IdMealPlan AS id
                VALUES (@organizationId, @owner, @patientId, @title, 'draft',
                        @data, @validFrom, @validTo)`);
      const id = inserted.recordset[0].id;
      const profile = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("planId", sql.UniqueIdentifier, id)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("weight", sql.Decimal(18, 6), input.requirement.weightKg)
        .input("height", sql.Decimal(18, 6), input.requirement.heightCm)
        .input("age", sql.Int, input.requirement.ageYears)
        .input("sex", sql.VarChar(20), input.requirement.sex)
        .input("activity", sql.Decimal(8, 4), input.requirement.activityFactor)
        .input("thermic", sql.Decimal(8, 4), input.requirement.thermicEffectPercent)
        .input("inputs", sql.NVarChar(sql.MAX), JSON.stringify(input.requirements.inputs))
        .query(`INSERT INTO RequirementProfiles
                  (IdOrganizacion, IdMealPlan, IdPaciente, WeightKg, HeightCm,
                   AgeYears, Sex, ActivityFactor, ThermicEffectPercent, InputsSnapshot)
                OUTPUT INSERTED.IdRequirementProfile AS id
                VALUES (@organizationId, @planId, @patientId, @weight, @height,
                        @age, @sex, @activity, @thermic, @inputs)`);
      const profileId = profile.recordset[0].id;
      await new sql.Request(transaction)
        .input("profileId", sql.UniqueIdentifier, profileId)
        .input("formulaCode", sql.VarChar(80), input.requirements.formulaCode)
        .input("formulaVersion", sql.VarChar(30), input.requirements.formulaVersion)
        .input("inputs", sql.NVarChar(sql.MAX), JSON.stringify(input.requirements.inputs))
        .input("basal", sql.Decimal(18, 6), input.requirements.basalEnergy)
        .input("activity", sql.Decimal(18, 6), input.requirements.activityEnergy)
        .input("thermic", sql.Decimal(18, 6), input.requirements.thermicEffectEnergy)
        .input("total", sql.Decimal(18, 6), input.requirements.totalEnergy)
        .input("unit", sql.VarChar(30), input.requirements.unit)
        .input("rounding", sql.Int, input.requirements.rounding)
        .query(`INSERT INTO EnergyCalculations
                  (IdRequirementProfile, FormulaCode, FormulaVersion, Inputs,
                   BasalEnergy, ActivityEnergy, ThermicEffectEnergy, TotalEnergy, Unit, Rounding)
                VALUES (@profileId, @formulaCode, @formulaVersion, @inputs,
                        @basal, @activity, @thermic, @total, @unit, @rounding)`);
      for (const macro of input.requirements.macros) {
        await new sql.Request(transaction)
          .input("profileId", sql.UniqueIdentifier, profileId)
          .input("code", sql.VarChar(40), macro.nutrientCode)
          .input("percent", sql.Decimal(8, 4), macro.percentEnergy)
          .input("kcal", sql.Decimal(18, 6), macro.kcal)
          .input("grams", sql.Decimal(18, 6), macro.grams)
          .input("gramsPerKg", sql.Decimal(18, 6), macro.gramsPerKg)
          .query(`INSERT INTO MacroTargets
                    (IdRequirementProfile, NutrientCode, PercentEnergy, Kcal, Grams, GramsPerKg)
                  VALUES (@profileId, @code, @percent, @kcal, @grams, @gramsPerKg)`);
      }
      for (const target of input.requirement.nutrientTargets) {
        await new sql.Request(transaction)
          .input("profileId", sql.UniqueIdentifier, profileId)
          .input("code", sql.VarChar(80), target.nutrientCode)
          .input("amount", sql.Decimal(18, 6), target.targetAmount)
          .input("unit", sql.VarChar(30), target.unit)
          .query(`INSERT INTO NutrientTargets
                    (IdRequirementProfile, NutrientCode, TargetAmount, Unit)
                  VALUES (@profileId, @code, @amount, @unit)`);
      }
      for (const item of input.mealDistribution) {
        await new sql.Request(transaction)
          .input("profileId", sql.UniqueIdentifier, profileId)
          .input("mealType", sql.NVarChar(80), item.mealType)
          .input("percent", sql.Decimal(8, 4), item.percentEnergy)
          .input("kcal", sql.Decimal(18, 6), item.targetKcal)
          .input("carbohydrate", sql.Decimal(18, 6), item.targetCarbohydrateG)
          .input("protein", sql.Decimal(18, 6), item.targetProteinG)
          .input("fat", sql.Decimal(18, 6), item.targetFatG)
          .input("position", sql.Int, item.position)
          .query(`INSERT INTO MealDistributions
                    (IdRequirementProfile, MealType, PercentEnergy, TargetKcal,
                     TargetCarbohydrateG, TargetProteinG, TargetFatG, Position)
                  VALUES (@profileId, @mealType, @percent, @kcal,
                          @carbohydrate, @protein, @fat, @position)`);
      }
      for (const restriction of input.restrictions) {
        await new sql.Request(transaction)
          .input("planId", sql.UniqueIdentifier, id)
          .input("type", sql.VarChar(30), restriction.type)
          .input("value", sql.NVarChar(200), restriction.value)
          .input("foodId", sql.UniqueIdentifier, restriction.foodId)
          .query(`INSERT INTO PlanRestrictions (IdMealPlan, RestrictionType, Value, FoodId)
                  VALUES (@planId, @type, @value, @foodId)`);
      }
      for (let dayPosition = 0; dayPosition < input.days.length; dayPosition += 1) {
        const day = input.days[dayPosition];
        const insertedDay = await new sql.Request(transaction)
          .input("planId", sql.UniqueIdentifier, id)
          .input("date", sql.Date, day.date)
          .input("label", sql.NVarChar(120), day.label)
          .input("position", sql.Int, dayPosition)
          .query(`INSERT INTO MenuDays (IdMealPlan, DayDate, Label, Position)
                  OUTPUT INSERTED.IdMenuDay AS id VALUES (@planId, @date, @label, @position)`);
        const dayId = insertedDay.recordset[0].id;
        for (let mealPosition = 0; mealPosition < day.meals.length; mealPosition += 1) {
          const meal = day.meals[mealPosition];
          const insertedMeal = await new sql.Request(transaction)
            .input("dayId", sql.UniqueIdentifier, dayId)
            .input("type", sql.NVarChar(80), meal.mealType)
            .input("time", sql.Time, meal.time ? new Date(`1970-01-01T${meal.time}:00Z`) : null)
            .input("position", sql.Int, mealPosition)
            .input("notes", sql.NVarChar(500), meal.notes)
            .query(`INSERT INTO MenuMeals (IdMenuDay, MealType, MealTime, Position, Notes)
                    OUTPUT INSERTED.IdMenuMeal AS id
                    VALUES (@dayId, @type, @time, @position, @notes)`);
          const mealId = insertedMeal.recordset[0].id;
          for (let itemPosition = 0; itemPosition < meal.items.length; itemPosition += 1) {
            const item = meal.items[itemPosition];
            await new sql.Request(transaction)
              .input("mealId", sql.UniqueIdentifier, mealId)
              .input("catalogType", sql.VarChar(20), item.catalogType)
              .input("catalogId", sql.UniqueIdentifier, item.catalogId)
              .input("catalogVersion", sql.Int, item.catalogVersion)
              .input("catalogSnapshot", sql.NVarChar(sql.MAX), JSON.stringify(item.catalogSnapshot))
              .input("amount", sql.Decimal(18, 6), item.amount)
              .input("amountUnit", sql.VarChar(30), item.amountUnit)
              .input("nutrients", sql.NVarChar(sql.MAX), JSON.stringify(item.nutrients))
              .input("position", sql.Int, itemPosition)
              .input("notes", sql.NVarChar(500), item.notes)
              .query(`INSERT INTO MenuItems
                        (IdMenuMeal, CatalogType, CatalogId, CatalogVersion, CatalogSnapshot,
                         Amount, AmountUnit, NutrientSnapshot, Position, Notes)
                      VALUES (@mealId, @catalogType, @catalogId, @catalogVersion, @catalogSnapshot,
                              @amount, @amountUnit, @nutrients, @position, @notes)`);
          }
        }
        await new sql.Request(transaction)
          .input("dayId", sql.UniqueIdentifier, dayId)
          .input("version", sql.VarChar(30), day.analysis.calculationVersion)
          .input("totals", sql.NVarChar(sql.MAX), JSON.stringify(day.analysis.totals))
          .input("targets", sql.NVarChar(sql.MAX), JSON.stringify(day.analysis.targets))
          .input("adequacy", sql.NVarChar(sql.MAX), JSON.stringify(day.analysis.adequacy))
          .query(`INSERT INTO MenuAdequacySnapshots
                    (IdMenuDay, CalculationVersion, Totals, Targets, Adequacy)
                  VALUES (@dayId, @version, @totals, @targets, @adequacy)`);
      }
      await this.addEvent(transaction, "planning.plan.created.v1", id, actor, {
        patientId: input.patientId,
        totalEnergy: input.requirements.totalEnergy,
        days: input.days.length,
      });
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async publish(actor, id, expectedVersion) {
    const snapshot = await this.get(actor, id);
    if (!snapshot) return null;
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const current = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("id", sql.UniqueIdentifier, id)
        .query(`SELECT Estado, Version, IdPaciente FROM MealPlans WITH (UPDLOCK, HOLDLOCK)
                WHERE IdOrganizacion=@organizationId AND IdMealPlan=@id`);
      const row = current.recordset[0];
      if (!row) {
        await transaction.rollback();
        return null;
      }
      if (row.Estado !== "draft" || row.Version !== expectedVersion) {
        await transaction.rollback();
        return { error: "conflict" };
      }
      const review = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("id", sql.UniqueIdentifier, id)
        .query(`SELECT
          CASE WHEN EXISTS (SELECT 1 FROM PlanGenerationRuns
                            WHERE IdOrganizacion=@organizationId AND IdMealPlan=@id)
               THEN 1 ELSE 0 END AS generated,
          (SELECT TOP (1) Decision FROM MealPlanReviews
           WHERE IdOrganizacion=@organizationId AND IdMealPlan=@id
           ORDER BY ReviewedAt DESC) AS latestDecision`);
      if (review.recordset[0].generated && review.recordset[0].latestDecision !== "approved") {
        await transaction.rollback();
        return { error: "review_required" };
      }
      const publishedAt = new Date();
      const publishedSnapshot = { ...snapshot, status: "published", publishedAt };
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("id", sql.UniqueIdentifier, id)
        .input("version", sql.Int, expectedVersion)
        .input("snapshot", sql.NVarChar(sql.MAX), JSON.stringify(publishedSnapshot))
        .input("owner", sql.Int, actor.id)
        .input("publishedAt", sql.DateTime2, publishedAt)
        .query(`INSERT INTO MealPlanVersions
                  (IdOrganizacion, IdMealPlan, VersionNumber, Snapshot, PublishedBy, PublishedAt)
                VALUES (@organizationId, @id, @version, @snapshot, @owner, @publishedAt);
                UPDATE MealPlans SET Estado='published', PublicadoEn=@publishedAt,
                       FechaActualizacion=SYSUTCDATETIME()
                WHERE IdOrganizacion=@organizationId AND IdMealPlan=@id;`);
      await this.addEvent(transaction, "planning.plan.published.v1", id, actor, {
        patientId: row.IdPaciente,
        version: expectedVersion,
      });
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async versions(actor, id) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT IdMealPlanVersion AS id, VersionNumber AS version,
                     Snapshot AS snapshot, PublishedBy AS publishedBy,
                     PublishedAt AS publishedAt
              FROM MealPlanVersions
              WHERE IdOrganizacion=@organizationId AND IdMealPlan=@id
              ORDER BY VersionNumber`);
    return result.recordset.map((item) => ({ ...item, snapshot: json(item.snapshot, {}) }));
  }

  async recordGeneration(actor, run) {
    const pool = await database();
    await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("patientId", sql.UniqueIdentifier, run.patientId)
      .input("planId", sql.UniqueIdentifier, run.planId)
      .input("owner", sql.Int, actor.id)
      .input("algorithm", sql.VarChar(40), run.algorithmVersion)
      .input("input", sql.NVarChar(sql.MAX), JSON.stringify(run.input))
      .input("result", sql.NVarChar(sql.MAX), JSON.stringify(run.result))
      .query(`INSERT INTO PlanGenerationRuns
        (IdOrganizacion, IdPaciente, IdMealPlan, RequestedBy, AlgorithmVersion,
         InputSnapshot, ResultSnapshot, Status, CompletedAt)
        VALUES (@organizationId, @patientId, @planId, @owner, @algorithm,
                @input, @result, 'completed', SYSUTCDATETIME())`);
  }

  async recordSubstitutions(actor, input, alternatives) {
    const pool = await database();
    await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("patientId", sql.UniqueIdentifier, input.patientId)
      .input("owner", sql.Int, actor.id)
      .input("input", sql.NVarChar(sql.MAX), JSON.stringify(input))
      .input("result", sql.NVarChar(sql.MAX), JSON.stringify(alternatives))
      .query(`INSERT INTO SubstitutionEvaluations
        (IdOrganizacion, IdPaciente, RequestedBy, InputSnapshot, ResultSnapshot, AlgorithmVersion)
        VALUES (@organizationId, @patientId, @owner, @input, @result, 'nutrient-similarity-1.0.0')`);
  }

  async createShoppingList(actor, plan, items) {
    const pool = await database();
    const snapshot = { planId: plan.id, planVersion: plan.version, items };
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("planId", sql.UniqueIdentifier, plan.id)
      .input("title", sql.NVarChar(200), `Compras - ${plan.title}`)
      .input("snapshot", sql.NVarChar(sql.MAX), JSON.stringify(snapshot))
      .input("owner", sql.Int, actor.id)
      .query(`INSERT INTO ShoppingLists
        (IdOrganizacion, IdMealPlan, Title, Snapshot, CreatedBy)
        OUTPUT INSERTED.IdShoppingList AS id, INSERTED.CreatedAt AS createdAt
        VALUES (@organizationId, @planId, @title, @snapshot, @owner)`);
    return { ...result.recordset[0], ...snapshot };
  }

  async review(actor, id, input) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .input("decision", sql.VarChar(20), input.decision)
      .input("comments", sql.NVarChar(2000), input.comments)
      .input("owner", sql.Int, actor.id)
      .query(`IF EXISTS (
          SELECT 1 FROM MealPlans WHERE IdOrganizacion=@organizationId AND IdMealPlan=@id
        )
        BEGIN
          INSERT INTO MealPlanReviews
            (IdOrganizacion, IdMealPlan, Decision, Comments, ReviewedBy)
          OUTPUT INSERTED.IdMealPlanReview AS id, INSERTED.Decision AS decision,
                 INSERTED.Comments AS comments, INSERTED.ReviewedBy AS reviewedBy,
                 INSERTED.ReviewedAt AS reviewedAt
          VALUES (@organizationId, @id, @decision, @comments, @owner);
        END`);
    return result.recordset[0] || null;
  }

  async addEvent(transaction, eventType, aggregateId, actor, data) {
    const payload = JSON.stringify({
      eventId: crypto.randomUUID(),
      eventType,
      occurredAt: new Date().toISOString(),
      actorId: actor.id,
      organizationId: actor.organizationId,
      aggregateId,
      data,
    });
    await new sql.Request(transaction)
      .input("eventType", sql.NVarChar(160), eventType)
      .input("aggregateId", sql.UniqueIdentifier, aggregateId)
      .input("payload", sql.NVarChar(sql.MAX), payload)
      .query(`INSERT INTO OutboxMessages (EventType, AggregateId, Payload)
              VALUES (@eventType, @aggregateId, @payload)`);
  }
}

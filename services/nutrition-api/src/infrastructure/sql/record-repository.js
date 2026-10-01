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

function map(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patientId,
    title: row.title,
    assessmentType: row.assessmentType,
    status: row.status,
    version: row.version,
    assessedAt: row.assessedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const select = `SELECT ${config.idColumn} AS id, IdPaciente AS patientId,
  Titulo AS title, TipoEvaluacion AS assessmentType, Estado AS status,
  Version AS version, FechaEvaluacion AS assessedAt, CompletadaEn AS completedAt,
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
    const result = await request.query(`${select}
      WHERE IdOrganizacion=@organizationId${filter}
      ORDER BY FechaEvaluacion DESC`);
    return result.recordset.map(map);
  }

  async get(actor, id) {
    const pool = await database();
    const request = () => pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id);
    const [base, lifestyle, dietary, recall, meals, items, frequency, entries, analysis] = await Promise.all([
      request().query(`${select} WHERE IdOrganizacion=@organizationId AND ${config.idColumn}=@id`),
      request().query(`SELECT DailyActivity AS dailyActivity, WorkSchedule AS workSchedule,
        SleepHours AS sleepHours, PhysicalActivity AS physicalActivity,
        ExerciseType AS exerciseType, ExerciseFrequencyPerWeek AS exerciseFrequencyPerWeek,
        ExerciseDurationMinutes AS exerciseDurationMinutes, ExerciseIntensity AS exerciseIntensity,
        Alcohol AS alcohol, Tobacco AS tobacco, Coffee AS coffee, OtherVariables AS otherVariables
        FROM LifestyleAssessments WHERE IdNutritionAssessment=@id`),
      request().query(`SELECT MealsPerDay AS mealsPerDay, Schedules AS schedules,
        PreparedBy AS preparedBy, Appetite AS appetite, Hunger AS hunger, Satiety AS satiety,
        Preferences AS preferences, DislikedFoods AS dislikedFoods,
        DiscomfortFoods AS discomfortFoods, Allergies AS allergies,
        Intolerances AS intolerances, Supplements AS supplements,
        EmotionalEating AS emotionalEating, StressEating AS stressEating,
        AddedSalt AS addedSalt, FatType AS fatType, PreviousDiets AS previousDiets,
        WeightLossMedications AS weightLossMedications, WaterLiters AS waterLiters,
        Beverages AS beverages, WeekendChanges AS weekendChanges
        FROM DietaryAssessments WHERE IdNutritionAssessment=@id`),
      request().query(`SELECT IdRecall24h AS id, RecallDate AS date, Notes AS notes
        FROM Recall24h WHERE IdNutritionAssessment=@id`),
      request().query(`SELECT meals.IdRecallMeal AS id, meals.IdRecall24h AS recallId,
        CONVERT(VARCHAR(5), meals.TimeOfDay, 108) AS time, meals.MealType AS mealType,
        meals.Position AS position, meals.Notes AS notes
        FROM RecallMeals meals JOIN Recall24h recall ON recall.IdRecall24h=meals.IdRecall24h
        WHERE recall.IdNutritionAssessment=@id ORDER BY meals.Position`),
      request().query(`SELECT items.IdRecallItem AS id, items.IdRecallMeal AS mealId,
        items.FoodId AS foodId, items.FoodVersion AS foodVersion,
        items.FoodSnapshot AS foodSnapshot, items.AmountGrams AS amountGrams,
        items.Unit AS unit, items.HouseholdMeasure AS householdMeasure,
        items.Preparation AS preparation, items.Notes AS notes, items.Position AS position
        FROM RecallItems items JOIN RecallMeals meals ON meals.IdRecallMeal=items.IdRecallMeal
        JOIN Recall24h recall ON recall.IdRecall24h=meals.IdRecall24h
        WHERE recall.IdNutritionAssessment=@id ORDER BY meals.Position, items.Position`),
      request().query(`SELECT IdFoodFrequencyAssessment AS id, PeriodStart AS periodStart,
        PeriodEnd AS periodEnd, Notes AS notes FROM FoodFrequencyAssessments
        WHERE IdNutritionAssessment=@id`),
      request().query(`SELECT entries.IdFoodFrequencyEntry AS id,
        entries.IdFoodFrequencyAssessment AS frequencyId, entries.FoodGroup AS foodGroup,
        entries.FrequencyValue AS frequencyValue, entries.FrequencyUnit AS frequencyUnit,
        entries.PortionDescription AS portionDescription, entries.Notes AS notes
        FROM FoodFrequencyEntries entries
        JOIN FoodFrequencyAssessments frequency
          ON frequency.IdFoodFrequencyAssessment=entries.IdFoodFrequencyAssessment
        WHERE frequency.IdNutritionAssessment=@id ORDER BY entries.FoodGroup`),
      request().query(`SELECT IdNutrientAnalysisSnapshot AS id, AnalysisType AS analysisType,
        CalculationVersion AS calculationVersion, Totals AS totals,
        SourcesSnapshot AS sources, CalculatedAt AS calculatedAt
        FROM NutrientAnalysisSnapshots WHERE IdNutritionAssessment=@id
        ORDER BY CalculatedAt`),
    ]);
    const assessment = map(base.recordset[0]);
    if (!assessment) return null;
    const lifestyleRow = lifestyle.recordset[0];
    const dietaryRow = dietary.recordset[0];
    const recallRow = recall.recordset[0];
    const itemsByMeal = Map.groupBy(items.recordset, (item) => String(item.mealId));
    const frequencyRow = frequency.recordset[0];
    return {
      ...assessment,
      lifestyle: lifestyleRow ? {
        ...lifestyleRow,
        sleepHours: number(lifestyleRow.sleepHours),
        exerciseFrequencyPerWeek: number(lifestyleRow.exerciseFrequencyPerWeek),
        otherVariables: json(lifestyleRow.otherVariables, {}),
      } : null,
      dietary: dietaryRow ? {
        ...dietaryRow,
        waterLiters: number(dietaryRow.waterLiters),
        schedules: json(dietaryRow.schedules, []),
        preferences: json(dietaryRow.preferences, []),
        dislikedFoods: json(dietaryRow.dislikedFoods, []),
        discomfortFoods: json(dietaryRow.discomfortFoods, []),
        allergies: json(dietaryRow.allergies, []),
        intolerances: json(dietaryRow.intolerances, []),
        supplements: json(dietaryRow.supplements, []),
        previousDiets: json(dietaryRow.previousDiets, []),
        weightLossMedications: json(dietaryRow.weightLossMedications, []),
        beverages: json(dietaryRow.beverages, []),
      } : null,
      recall24h: recallRow ? {
        ...recallRow,
        meals: meals.recordset.map((meal) => ({
          ...meal,
          items: (itemsByMeal.get(String(meal.id)) || []).map((item) => ({
            ...item,
            amountGrams: number(item.amountGrams),
            foodSnapshot: json(item.foodSnapshot, {}),
          })),
        })),
      } : null,
      foodFrequency: frequencyRow ? {
        ...frequencyRow,
        entries: entries.recordset.map((item) => ({ ...item, frequencyValue: number(item.frequencyValue) })),
      } : null,
      analyses: analysis.recordset.map((item) => ({
        ...item,
        totals: json(item.totals, []),
        sources: json(item.sources, []),
      })),
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
        .input("assessmentType", sql.VarChar(40), input.assessmentType)
        .input("assessedAt", sql.DateTime2, input.assessedAt ? new Date(input.assessedAt) : new Date())
        .input("data", sql.NVarChar(sql.MAX), JSON.stringify({
          hasLifestyle: Boolean(input.lifestyle),
          hasDietary: Boolean(input.dietary),
          hasRecall24h: Boolean(input.recall24h),
          hasFoodFrequency: Boolean(input.foodFrequency),
        }))
        .query(`INSERT INTO NutritionAssessments
                  (IdOrganizacion, IdNutricionista, IdPaciente, Titulo, Estado,
                   Datos, TipoEvaluacion, FechaEvaluacion)
                OUTPUT INSERTED.IdNutritionAssessment AS id
                VALUES (@organizationId, @owner, @patientId, @title, 'draft',
                        @data, @assessmentType, @assessedAt)`);
      const id = inserted.recordset[0].id;
      if (input.lifestyle) await this.insertLifestyle(transaction, id, input.lifestyle);
      if (input.dietary) await this.insertDietary(transaction, id, input.dietary);
      if (input.recall24h) await this.insertRecall(transaction, id, input.recall24h);
      if (input.foodFrequency) await this.insertFrequency(transaction, id, input.foodFrequency);
      if (input.analysis) {
        await new sql.Request(transaction)
          .input("assessmentId", sql.UniqueIdentifier, id)
          .input("version", sql.VarChar(30), input.analysis.calculationVersion)
          .input("totals", sql.NVarChar(sql.MAX), JSON.stringify(input.analysis.totals))
          .input("sources", sql.NVarChar(sql.MAX), JSON.stringify(input.analysis.sources))
          .query(`INSERT INTO NutrientAnalysisSnapshots
                    (IdNutritionAssessment, AnalysisType, CalculationVersion, Totals, SourcesSnapshot)
                  VALUES (@assessmentId, 'recall_24h', @version, @totals, @sources)`);
      }
      await this.addEvent(transaction, "nutrition.assessment.created.v1", id, actor, {
        patientId: input.patientId,
        assessmentType: input.assessmentType,
      });
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async complete(actor, id, expectedVersion) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const current = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("id", sql.UniqueIdentifier, id)
        .query(`SELECT IdPaciente, Estado, Version FROM NutritionAssessments WITH (UPDLOCK, HOLDLOCK)
                WHERE IdOrganizacion=@organizationId AND IdNutritionAssessment=@id`);
      const row = current.recordset[0];
      if (!row) {
        await transaction.rollback();
        return null;
      }
      if (row.Estado !== "draft" || row.Version !== expectedVersion) {
        await transaction.rollback();
        return { error: "conflict" };
      }
      await new sql.Request(transaction)
        .input("id", sql.UniqueIdentifier, id)
        .query(`UPDATE NutritionAssessments SET Estado='completed', Version=Version+1,
                       CompletadaEn=SYSUTCDATETIME(), FechaActualizacion=SYSUTCDATETIME()
                WHERE IdNutritionAssessment=@id`);
      await this.addEvent(transaction, "nutrition.assessment.completed.v1", id, actor, {
        patientId: row.IdPaciente,
        version: expectedVersion + 1,
      });
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async insertLifestyle(transaction, id, value) {
    await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .input("dailyActivity", sql.NVarChar(500), value.dailyActivity)
      .input("workSchedule", sql.NVarChar(500), value.workSchedule)
      .input("sleepHours", sql.Decimal(5, 2), value.sleepHours)
      .input("physicalActivity", sql.NVarChar(500), value.physicalActivity)
      .input("exerciseType", sql.NVarChar(200), value.exerciseType)
      .input("frequency", sql.Decimal(5, 2), value.exerciseFrequencyPerWeek)
      .input("duration", sql.Int, value.exerciseDurationMinutes)
      .input("intensity", sql.VarChar(30), value.exerciseIntensity)
      .input("alcohol", sql.NVarChar(300), value.alcohol)
      .input("tobacco", sql.NVarChar(300), value.tobacco)
      .input("coffee", sql.NVarChar(300), value.coffee)
      .input("other", sql.NVarChar(sql.MAX), JSON.stringify(value.otherVariables))
      .query(`INSERT INTO LifestyleAssessments
                (IdNutritionAssessment, DailyActivity, WorkSchedule, SleepHours,
                 PhysicalActivity, ExerciseType, ExerciseFrequencyPerWeek,
                 ExerciseDurationMinutes, ExerciseIntensity, Alcohol, Tobacco, Coffee, OtherVariables)
              VALUES (@id, @dailyActivity, @workSchedule, @sleepHours, @physicalActivity,
                      @exerciseType, @frequency, @duration, @intensity,
                      @alcohol, @tobacco, @coffee, @other)`);
  }

  async insertDietary(transaction, id, value) {
    await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .input("meals", sql.Int, value.mealsPerDay)
      .input("schedules", sql.NVarChar(sql.MAX), JSON.stringify(value.schedules))
      .input("preparedBy", sql.NVarChar(200), value.preparedBy)
      .input("appetite", sql.NVarChar(300), value.appetite)
      .input("hunger", sql.NVarChar(300), value.hunger)
      .input("satiety", sql.NVarChar(300), value.satiety)
      .input("preferences", sql.NVarChar(sql.MAX), JSON.stringify(value.preferences))
      .input("disliked", sql.NVarChar(sql.MAX), JSON.stringify(value.dislikedFoods))
      .input("discomfort", sql.NVarChar(sql.MAX), JSON.stringify(value.discomfortFoods))
      .input("allergies", sql.NVarChar(sql.MAX), JSON.stringify(value.allergies))
      .input("intolerances", sql.NVarChar(sql.MAX), JSON.stringify(value.intolerances))
      .input("supplements", sql.NVarChar(sql.MAX), JSON.stringify(value.supplements))
      .input("emotional", sql.NVarChar(500), value.emotionalEating)
      .input("stress", sql.NVarChar(500), value.stressEating)
      .input("salt", sql.NVarChar(200), value.addedSalt)
      .input("fatType", sql.NVarChar(200), value.fatType)
      .input("previous", sql.NVarChar(sql.MAX), JSON.stringify(value.previousDiets))
      .input("medications", sql.NVarChar(sql.MAX), JSON.stringify(value.weightLossMedications))
      .input("water", sql.Decimal(8, 3), value.waterLiters)
      .input("beverages", sql.NVarChar(sql.MAX), JSON.stringify(value.beverages))
      .input("weekend", sql.NVarChar(1000), value.weekendChanges)
      .query(`INSERT INTO DietaryAssessments
                (IdNutritionAssessment, MealsPerDay, Schedules, PreparedBy, Appetite,
                 Hunger, Satiety, Preferences, DislikedFoods, DiscomfortFoods,
                 Allergies, Intolerances, Supplements, EmotionalEating, StressEating,
                 AddedSalt, FatType, PreviousDiets, WeightLossMedications,
                 WaterLiters, Beverages, WeekendChanges)
              VALUES (@id, @meals, @schedules, @preparedBy, @appetite, @hunger, @satiety,
                      @preferences, @disliked, @discomfort, @allergies, @intolerances,
                      @supplements, @emotional, @stress, @salt, @fatType, @previous,
                      @medications, @water, @beverages, @weekend)`);
  }

  async insertRecall(transaction, id, value) {
    const recall = await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .input("date", sql.Date, value.date)
      .input("notes", sql.NVarChar(1000), value.notes)
      .query(`INSERT INTO Recall24h (IdNutritionAssessment, RecallDate, Notes)
              OUTPUT INSERTED.IdRecall24h AS id VALUES (@id, @date, @notes)`);
    const recallId = recall.recordset[0].id;
    for (let mealPosition = 0; mealPosition < value.meals.length; mealPosition += 1) {
      const meal = value.meals[mealPosition];
      const insertedMeal = await new sql.Request(transaction)
        .input("recallId", sql.UniqueIdentifier, recallId)
        .input("time", sql.Time, meal.time ? new Date(`1970-01-01T${meal.time}:00Z`) : null)
        .input("mealType", sql.NVarChar(80), meal.mealType)
        .input("position", sql.Int, mealPosition)
        .input("notes", sql.NVarChar(500), meal.notes)
        .query(`INSERT INTO RecallMeals (IdRecall24h, TimeOfDay, MealType, Position, Notes)
                OUTPUT INSERTED.IdRecallMeal AS id
                VALUES (@recallId, @time, @mealType, @position, @notes)`);
      const mealId = insertedMeal.recordset[0].id;
      for (let itemPosition = 0; itemPosition < meal.items.length; itemPosition += 1) {
        const item = meal.items[itemPosition];
        await new sql.Request(transaction)
          .input("mealId", sql.UniqueIdentifier, mealId)
          .input("foodId", sql.UniqueIdentifier, item.foodSnapshot.id)
          .input("foodVersion", sql.Int, item.foodSnapshot.version)
          .input("snapshot", sql.NVarChar(sql.MAX), JSON.stringify(item.foodSnapshot))
          .input("amount", sql.Decimal(18, 6), item.amountGrams)
          .input("unit", sql.NVarChar(40), item.unit)
          .input("measure", sql.NVarChar(120), item.householdMeasure)
          .input("preparation", sql.NVarChar(300), item.preparation)
          .input("notes", sql.NVarChar(500), item.notes)
          .input("position", sql.Int, itemPosition)
          .query(`INSERT INTO RecallItems
                    (IdRecallMeal, FoodId, FoodVersion, FoodSnapshot, AmountGrams,
                     Unit, HouseholdMeasure, Preparation, Notes, Position)
                  VALUES (@mealId, @foodId, @foodVersion, @snapshot, @amount,
                          @unit, @measure, @preparation, @notes, @position)`);
      }
    }
  }

  async insertFrequency(transaction, id, value) {
    const inserted = await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .input("start", sql.Date, value.periodStart)
      .input("end", sql.Date, value.periodEnd)
      .input("notes", sql.NVarChar(1000), value.notes)
      .query(`INSERT INTO FoodFrequencyAssessments
                (IdNutritionAssessment, PeriodStart, PeriodEnd, Notes)
              OUTPUT INSERTED.IdFoodFrequencyAssessment AS id
              VALUES (@id, @start, @end, @notes)`);
    const frequencyId = inserted.recordset[0].id;
    for (const entry of value.entries) {
      await new sql.Request(transaction)
        .input("frequencyId", sql.UniqueIdentifier, frequencyId)
        .input("group", sql.NVarChar(120), entry.foodGroup)
        .input("value", sql.Decimal(10, 3), entry.frequencyValue)
        .input("unit", sql.VarChar(30), entry.frequencyUnit)
        .input("portion", sql.NVarChar(200), entry.portionDescription)
        .input("notes", sql.NVarChar(500), entry.notes)
        .query(`INSERT INTO FoodFrequencyEntries
                  (IdFoodFrequencyAssessment, FoodGroup, FrequencyValue,
                   FrequencyUnit, PortionDescription, Notes)
                VALUES (@frequencyId, @group, @value, @unit, @portion, @notes)`);
    }
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

import { z } from "zod";

export const recordId = z.string().uuid();

const optionalText = (max) => z.string().trim().max(max).nullable().optional().default(null);
const stringList = z.array(z.string().trim().min(1).max(200)).max(200).optional().default([]);

const lifestyleSchema = z.object({
  dailyActivity: optionalText(500),
  workSchedule: optionalText(500),
  sleepHours: z.number().min(0).max(24).nullable().optional().default(null),
  physicalActivity: optionalText(500),
  exerciseType: optionalText(200),
  exerciseFrequencyPerWeek: z.number().min(0).max(50).nullable().optional().default(null),
  exerciseDurationMinutes: z.number().int().min(0).max(1440).nullable().optional().default(null),
  exerciseIntensity: z.enum(["low", "moderate", "high"]).nullable().optional().default(null),
  alcohol: optionalText(300),
  tobacco: optionalText(300),
  coffee: optionalText(300),
  otherVariables: z.record(z.string(), z.unknown()).optional().default({}),
});

const dietarySchema = z.object({
  mealsPerDay: z.number().int().min(0).max(30).nullable().optional().default(null),
  schedules: stringList,
  preparedBy: optionalText(200),
  appetite: optionalText(300),
  hunger: optionalText(300),
  satiety: optionalText(300),
  preferences: stringList,
  dislikedFoods: stringList,
  discomfortFoods: stringList,
  allergies: stringList,
  intolerances: stringList,
  supplements: stringList,
  emotionalEating: optionalText(500),
  stressEating: optionalText(500),
  addedSalt: optionalText(200),
  fatType: optionalText(200),
  previousDiets: stringList,
  weightLossMedications: stringList,
  waterLiters: z.number().min(0).max(100).nullable().optional().default(null),
  beverages: stringList,
  weekendChanges: optionalText(1000),
});

const recallItemSchema = z.object({
  foodId: z.string().uuid(),
  amountGrams: z.number().positive().max(100000),
  unit: z.string().trim().min(1).max(40).optional().default("g"),
  householdMeasure: optionalText(120),
  preparation: optionalText(300),
  notes: optionalText(500),
});

const recallSchema = z.object({
  date: z.iso.date(),
  notes: optionalText(1000),
  meals: z.array(z.object({
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional().default(null),
    mealType: z.string().trim().min(1).max(80),
    notes: optionalText(500),
    items: z.array(recallItemSchema).min(1).max(100),
  })).min(1).max(30),
});

const frequencySchema = z.object({
  periodStart: z.iso.date().nullable().optional().default(null),
  periodEnd: z.iso.date().nullable().optional().default(null),
  notes: optionalText(1000),
  entries: z.array(z.object({
    foodGroup: z.string().trim().min(1).max(120),
    frequencyValue: z.number().min(0).max(10000),
    frequencyUnit: z.enum(["day", "week", "month", "never"]),
    portionDescription: optionalText(200),
    notes: optionalText(500),
  })).min(1).max(300),
}).superRefine((value, context) => {
  if (value.periodStart && value.periodEnd && value.periodStart > value.periodEnd) {
    context.addIssue({ code: "custom", path: ["periodEnd"], message: "El fin no puede ser anterior al inicio." });
  }
});

export const recordInput = z.object({
  patientId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  assessmentType: z.enum(["comprehensive", "lifestyle", "dietary", "recall_24h", "food_frequency"]).optional().default("comprehensive"),
  assessedAt: z.iso.datetime().optional(),
  lifestyle: lifestyleSchema.nullable().optional().default(null),
  dietary: dietarySchema.nullable().optional().default(null),
  recall24h: recallSchema.nullable().optional().default(null),
  foodFrequency: frequencySchema.nullable().optional().default(null),
}).refine((value) => value.lifestyle || value.dietary || value.recall24h || value.foodFrequency, {
  message: "La evaluación debe contener al menos una sección.",
});

export const completeInput = z.object({
  expectedVersion: z.number().int().positive(),
});

export function analyzeRecall(recall) {
  if (!recall) return null;
  const totals = {};
  const sources = [];
  for (const meal of recall.meals) {
    for (const item of meal.items) {
      const factor = item.amountGrams / 100;
      sources.push({
        foodId: item.foodSnapshot.id,
        foodVersion: item.foodSnapshot.version,
        amountGrams: item.amountGrams,
        nutrients: item.foodSnapshot.nutrients,
      });
      for (const nutrient of item.foodSnapshot.nutrients) {
        const code = nutrient.nutrientCode;
        const amount = Number(nutrient.amountPer100g) * factor;
        const current = totals[code] || {
          nutrientCode: code,
          nutrientName: nutrient.nutrientName,
          unit: nutrient.unit,
          amount: 0,
        };
        current.amount = Number((current.amount + amount).toFixed(6));
        totals[code] = current;
      }
    }
  }
  return {
    calculationVersion: "nutrition-snapshot-1.0.0",
    totals: Object.values(totals),
    sources,
  };
}

export const resource = Object.freeze({
  label: "evaluación nutricional",
  path: "/v1/nutrition-assessments",
  eventPrefix: "nutrition",
});

import { z } from "zod";

export const recordId = z.string().uuid();
const optionalText = (max) => z.string().trim().max(max).nullable().optional().default(null);

export const requirementSchema = z.object({
  weightKg: z.number().positive().max(1000),
  heightCm: z.number().positive().max(300),
  ageYears: z.number().int().min(1).max(130),
  sex: z.enum(["male", "female"]),
  formulaCode: z.literal("MIFFLIN_ST_JEOR").optional().default("MIFFLIN_ST_JEOR"),
  activityFactor: z.number().min(1).max(3),
  thermicEffectPercent: z.number().min(0).max(30).optional().default(10),
  macroPercentages: z.object({
    carbohydrate: z.number().min(0).max(100),
    protein: z.number().min(0).max(100),
    fat: z.number().min(0).max(100),
  }).superRefine((value, context) => {
    const total = value.carbohydrate + value.protein + value.fat;
    if (Math.abs(total - 100) > 0.001) {
      context.addIssue({ code: "custom", message: "Los porcentajes de macronutrientes deben sumar 100." });
    }
  }),
  nutrientTargets: z.array(z.object({
    nutrientCode: z.string().trim().min(1).max(80),
    targetAmount: z.number().positive(),
    unit: z.string().trim().min(1).max(30),
  })).max(200).optional().default([]),
});

export const mealDistributionSchema = z.array(z.object({
  mealType: z.string().trim().min(1).max(80),
  percentEnergy: z.number().positive().max(100),
})).min(1).max(20).superRefine((items, context) => {
  const total = items.reduce((sum, item) => sum + item.percentEnergy, 0);
  if (Math.abs(total - 100) > 0.001) {
    context.addIssue({ code: "custom", message: "La distribución por comidas debe sumar 100." });
  }
});

export const restrictionSchema = z.object({
  type: z.enum(["allergy", "intolerance", "excluded", "contraindication"]),
  value: z.string().trim().min(1).max(200),
  foodId: z.string().uuid().nullable().optional().default(null),
});

const menuItemSchema = z.object({
  catalogType: z.enum(["food", "recipe"]),
  catalogId: z.string().uuid(),
  amount: z.number().positive().max(100000),
  amountUnit: z.enum(["g", "serving"]),
  notes: optionalText(500),
}).superRefine((item, context) => {
  if (item.catalogType === "food" && item.amountUnit !== "g") {
    context.addIssue({ code: "custom", path: ["amountUnit"], message: "Un alimento debe expresarse en g." });
  }
  if (item.catalogType === "recipe" && item.amountUnit !== "serving") {
    context.addIssue({ code: "custom", path: ["amountUnit"], message: "Una receta debe expresarse en porciones." });
  }
});

const menuDaySchema = z.object({
  date: z.iso.date().nullable().optional().default(null),
  label: z.string().trim().min(1).max(120),
  meals: z.array(z.object({
    mealType: z.string().trim().min(1).max(80),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional().default(null),
    notes: optionalText(500),
    items: z.array(menuItemSchema).min(1).max(100),
  })).min(1).max(30),
});

export const recordInput = z.object({
  patientId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  validFrom: z.iso.date().nullable().optional().default(null),
  validTo: z.iso.date().nullable().optional().default(null),
  requirement: requirementSchema,
  mealDistribution: mealDistributionSchema,
  restrictions: z.array(restrictionSchema).max(200).optional().default([]),
  days: z.array(menuDaySchema).min(1).max(90),
}).superRefine((value, context) => {
  if (value.validFrom && value.validTo && value.validFrom > value.validTo) {
    context.addIssue({ code: "custom", path: ["validTo"], message: "La vigencia final no puede ser anterior al inicio." });
  }
});

export const publishInput = z.object({
  expectedVersion: z.number().int().positive(),
});

export const generatorInput = z.object({
  patientId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  validFrom: z.iso.date().nullable().optional().default(null),
  validTo: z.iso.date().nullable().optional().default(null),
  requirement: requirementSchema,
  mealDistribution: mealDistributionSchema,
  restrictions: z.array(restrictionSchema).max(200).optional().default([]),
  daysCount: z.number().int().min(1).max(14),
  candidateItems: z.array(z.object({
    catalogType: z.enum(["food", "recipe"]),
    catalogId: z.string().uuid(),
  })).min(1).max(100),
}).superRefine((value, context) => {
  if (value.validFrom && value.validTo && value.validFrom > value.validTo) {
    context.addIssue({ code: "custom", path: ["validTo"], message: "La vigencia final no puede ser anterior al inicio." });
  }
});

export const reviewInput = z.object({
  decision: z.enum(["approved", "changes_requested"]),
  comments: z.string().trim().max(2000).nullable().optional().default(null),
});

export const substitutionInput = z.object({
  patientId: z.string().uuid(),
  original: z.object({
    catalogType: z.enum(["food", "recipe"]),
    catalogId: z.string().uuid(),
    amount: z.number().positive(),
    amountUnit: z.enum(["g", "serving"]),
  }),
  candidates: z.array(z.object({
    catalogType: z.enum(["food", "recipe"]),
    catalogId: z.string().uuid(),
  })).min(1).max(50),
  restrictions: z.array(restrictionSchema).max(200).default([]),
});

function round(value, decimals = 6) {
  return Number(value.toFixed(decimals));
}

export function calculateRequirements(input) {
  const sexConstant = input.sex === "male" ? 5 : -161;
  const basalEnergy = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears + sexConstant;
  const activityAdjusted = basalEnergy * input.activityFactor;
  const activityEnergy = activityAdjusted - basalEnergy;
  const thermicEffectEnergy = activityAdjusted * (input.thermicEffectPercent / 100);
  const totalEnergy = activityAdjusted + thermicEffectEnergy;
  const macroDefinitions = [
    ["carbohydrate_g", input.macroPercentages.carbohydrate, 4],
    ["protein_g", input.macroPercentages.protein, 4],
    ["fat_g", input.macroPercentages.fat, 9],
  ];
  const macros = macroDefinitions.map(([nutrientCode, percentEnergy, kcalPerGram]) => {
    const kcal = totalEnergy * percentEnergy / 100;
    const grams = kcal / kcalPerGram;
    return {
      nutrientCode,
      percentEnergy,
      kcal: round(kcal),
      grams: round(grams),
      gramsPerKg: round(grams / input.weightKg),
    };
  });
  return {
    formulaCode: input.formulaCode,
    formulaVersion: "1.0.0",
    source: "Mifflin MD et al. Am J Clin Nutr. 1990;51:241-247.",
    unit: "kcal/day",
    rounding: 0,
    inputs: {
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      ageYears: input.ageYears,
      sex: input.sex,
      activityFactor: input.activityFactor,
      thermicEffectPercent: input.thermicEffectPercent,
    },
    basalEnergy: round(basalEnergy),
    activityEnergy: round(activityEnergy),
    thermicEffectEnergy: round(thermicEffectEnergy),
    totalEnergy: round(totalEnergy),
    macros,
  };
}

export function calculateMealDistribution(distribution, requirements) {
  const macros = Object.fromEntries(requirements.macros.map((item) => [item.nutrientCode, item]));
  return distribution.map((item, position) => {
    const factor = item.percentEnergy / 100;
    return {
      ...item,
      position,
      targetKcal: round(requirements.totalEnergy * factor),
      targetCarbohydrateG: round(macros.carbohydrate_g.grams * factor),
      targetProteinG: round(macros.protein_g.grams * factor),
      targetFatG: round(macros.fat_g.grams * factor),
    };
  });
}

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function findRestrictionViolation(snapshot, restrictions) {
  const ingredientFoods = snapshot.ingredients?.map((item) => item.foodSnapshot || item.food || {}) || [];
  const foodIds = new Set([
    String(snapshot.id),
    ...ingredientFoods.map((food) => String(food.id)),
  ]);
  const text = normalized([
    snapshot.name,
    snapshot.category,
    snapshot.description,
    snapshot.brand,
    ...(snapshot.tags || []).map((tag) => tag.name || tag),
    ...ingredientFoods.flatMap((food) => [food.name, food.category, food.brand]),
  ].filter(Boolean).join(" "));
  return restrictions.find((restriction) =>
    (restriction.foodId && foodIds.has(String(restriction.foodId)))
    || (!restriction.foodId && text.includes(normalized(restriction.value))));
}

export function nutrientsForCatalogItem(snapshot, catalogType, amount) {
  if (catalogType === "food") {
    return snapshot.nutrients.map((nutrient) => ({
      nutrientCode: nutrient.nutrientCode,
      nutrientName: nutrient.nutrientName,
      unit: nutrient.unit,
      amount: round(Number(nutrient.amountPer100g) * amount / 100),
    }));
  }
  return snapshot.nutrients.map((nutrient) => ({
    nutrientCode: nutrient.nutrientCode,
    nutrientName: nutrient.nutrientName,
    unit: nutrient.unit,
    amount: round(Number(nutrient.amountPerServing) * amount),
  }));
}

export function calculateAdequacy(days, requirements, extraTargets) {
  const targets = [
    { nutrientCode: "energy_kcal", targetAmount: requirements.totalEnergy, unit: "kcal" },
    ...requirements.macros.map((item) => ({
      nutrientCode: item.nutrientCode,
      targetAmount: item.grams,
      unit: "g",
    })),
    ...extraTargets,
  ];
  return days.map((day) => {
    const totals = new Map();
    for (const meal of day.meals) {
      for (const item of meal.items) {
        for (const nutrient of item.nutrients) {
          const current = totals.get(nutrient.nutrientCode) || { ...nutrient, amount: 0 };
          current.amount = round(current.amount + nutrient.amount);
          totals.set(nutrient.nutrientCode, current);
        }
      }
    }
    const totalList = [...totals.values()];
    return {
      ...day,
      analysis: {
        calculationVersion: "menu-adequacy-1.0.0",
        totals: totalList,
        targets,
        adequacy: targets.map((target) => {
          const actual = totalList.find((item) => item.nutrientCode === target.nutrientCode)?.amount || 0;
          return {
            nutrientCode: target.nutrientCode,
            actual: round(actual),
            target: target.targetAmount,
            unit: target.unit,
            percentage: round(actual / target.targetAmount * 100, 2),
          };
        }),
      },
    };
  });
}

export const resource = Object.freeze({
  label: "plan alimentario",
  path: "/v1/meal-plans",
  eventPrefix: "planning",
});

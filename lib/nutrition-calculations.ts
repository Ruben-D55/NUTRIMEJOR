export type NutritionInputs = {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: "male" | "female";
  activityFactor: number;
  thermicEffectPercent: number;
  carbohydratePercent: number;
  proteinPercent: number;
  fatPercent: number;
};

export function nutritionCalculations(input: NutritionInputs) {
  const heightM = input.heightCm / 100;
  const bmi = input.weightKg / (heightM * heightM);
  const basalEnergy = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears
    + (input.sex === "male" ? 5 : -161);
  const activityAdjusted = basalEnergy * input.activityFactor;
  const thermicEffectEnergy = activityAdjusted * input.thermicEffectPercent / 100;
  const totalEnergy = activityAdjusted + thermicEffectEnergy;
  return {
    bmi,
    basalEnergy,
    activityEnergy: activityAdjusted - basalEnergy,
    thermicEffectEnergy,
    totalEnergy,
    macros: {
      carbohydrate: totalEnergy * input.carbohydratePercent / 100 / 4,
      protein: totalEnergy * input.proteinPercent / 100 / 4,
      fat: totalEnergy * input.fatPercent / 100 / 9,
    },
  };
}

export function bmiLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Sin cálculo";
  if (value < 18.5) return "Bajo peso";
  if (value < 25) return "Rango saludable";
  if (value < 30) return "Sobrepeso";
  return "Obesidad";
}

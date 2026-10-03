"use client";

import { useState } from "react";
import { NutritionCalculator } from "@/components/platform/nutrition-calculator";
import type { NutritionInputs } from "@/lib/nutrition-calculations";

const defaults: NutritionInputs = { weightKg: 70, heightCm: 170, ageYears: 30, sex: "female", activityFactor: 1.55, thermicEffectPercent: 10, carbohydratePercent: 50, proteinPercent: 20, fatPercent: 30 };

export default function Page() {
  const [value, setValue] = useState(defaults);
  return <section>
    <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Herramientas clínicas</p>
    <h1 className="mt-2 font-display text-3xl font-bold">Cálculos nutricionales</h1>
    <p className="mt-2 text-slate-500">Calcula IMC, metabolismo basal, gasto energético y macronutrientes con el mismo modelo usado al generar planes.</p>
    <div className="card mt-6 p-6"><NutritionCalculator value={value} onChange={setValue}/></div>
    <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">Las estimaciones usan Mifflin–St Jeor y requieren interpretación profesional.</p>
  </section>;
}

"use client";

import { Calculator, Flame, Gauge, PieChart } from "lucide-react";
import { nutritionCalculations, bmiLabel, type NutritionInputs } from "@/lib/nutrition-calculations";

export function NutritionCalculator({ value, onChange }: { value: NutritionInputs; onChange: (value: NutritionInputs) => void }) {
  const result = nutritionCalculations(value);
  const update = (key: keyof NutritionInputs, raw: string) => onChange({ ...value, [key]: key === "sex" ? raw : Number(raw) });
  const macroTotal = value.carbohydratePercent + value.proteinPercent + value.fatPercent;
  const metrics = [
    [Gauge, "IMC", result.bmi.toFixed(1), bmiLabel(result.bmi)],
    [Flame, "TMB", `${Math.round(result.basalEnergy)} kcal`, "Mifflin–St Jeor"],
    [Calculator, "Gasto energético", `${Math.round(result.totalEnergy)} kcal`, `Actividad + efecto térmico (${value.thermicEffectPercent}%)`],
    [PieChart, "Macros", `${Math.round(result.macros.carbohydrate)} C · ${Math.round(result.macros.protein)} P · ${Math.round(result.macros.fat)} G`, "gramos por día"],
  ] as const;
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <NumberField label="Peso (kg)" value={value.weightKg} min={1} step="0.1" onChange={(v)=>update("weightKg",v)}/>
      <NumberField label="Estatura (cm)" value={value.heightCm} min={1} onChange={(v)=>update("heightCm",v)}/>
      <NumberField label="Edad" value={value.ageYears} min={1} onChange={(v)=>update("ageYears",v)}/>
      <label className="text-sm font-semibold">Sexo<select className="field" value={value.sex} onChange={(e)=>update("sex",e.target.value)}><option value="female">Femenino</option><option value="male">Masculino</option></select></label>
      <label className="text-sm font-semibold">Actividad<select className="field" value={value.activityFactor} onChange={(e)=>update("activityFactor",e.target.value)}><option value="1.2">Sedentaria</option><option value="1.375">Ligera</option><option value="1.55">Moderada</option><option value="1.725">Intensa</option><option value="1.9">Muy intensa</option></select></label>
      <NumberField label="Efecto térmico (%)" value={value.thermicEffectPercent} min={0} max={30} onChange={(v)=>update("thermicEffectPercent",v)}/>
    </div>
    <fieldset><legend className="text-sm font-semibold">Distribución de macronutrientes</legend><div className="mt-2 grid grid-cols-3 gap-3"><NumberField label="Carbohidratos %" value={value.carbohydratePercent} min={0} max={100} onChange={(v)=>update("carbohydratePercent",v)}/><NumberField label="Proteína %" value={value.proteinPercent} min={0} max={100} onChange={(v)=>update("proteinPercent",v)}/><NumberField label="Grasa %" value={value.fatPercent} min={0} max={100} onChange={(v)=>update("fatPercent",v)}/></div>{macroTotal !== 100 && <p className="field-error mt-2" role="alert">Los macronutrientes deben sumar 100%. Total actual: {macroTotal}%.</p>}</fieldset>
    <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">{metrics.map(([Icon,label,number,detail])=><article className="rounded-xl border p-4 dark:border-emerald-800" key={label}><div className="flex items-center gap-2 text-sm text-slate-500"><Icon className="h-4 w-4 text-emerald-700"/>{label}</div><strong className="mt-2 block font-display text-xl">{number}</strong><small className="text-slate-500">{detail}</small></article>)}</div>
  </div>;
}

function NumberField({label,value,min,max,step="1",onChange}:{label:string;value:number;min?:number;max?:number;step?:string;onChange:(value:string)=>void}) { return <label className="text-sm font-semibold">{label}<input className="field" type="number" value={value} min={min} max={max} step={step} onChange={(e)=>onChange(e.target.value)}/></label>; }

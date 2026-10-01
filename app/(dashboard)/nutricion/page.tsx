import { Utensils } from "lucide-react";
import { ModuleOverview } from "@/components/platform/module-overview";

export default function NutritionPage() {
  return <ModuleOverview title="Evaluación nutricional" description="Estilo de vida, evaluación dietética, recordatorio de 24 horas y frecuencia de consumo." service="nutrition" icon={Utensils} capabilities={["Estilo de vida", "Evaluación dietética", "Recordatorio de 24 horas", "Frecuencia de consumo Pro", "Análisis de macro y micronutrientes", "Snapshots históricos"]} actions={[{ label: "Seleccionar paciente", href: "/pacientes" }, { label: "Explorar alimentos", href: "/catalogos/alimentos" }]} />;
}

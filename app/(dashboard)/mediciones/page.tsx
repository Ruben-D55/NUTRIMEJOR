import { Ruler } from "lucide-react";
import { ModuleOverview } from "@/components/platform/module-overview";

export default function MeasurementsPage() {
  return <ModuleOverview title="Mediciones" description="Antropometría, signos vitales, laboratorios y evaluaciones deportivas reproducibles." service="measurements" icon={Ruler} capabilities={["Sesiones inmutables", "Antropometría básica", "Signos vitales y laboratorios", "Fórmulas versionadas", "Comparación inicial y actual", "ISAK 1 y 2 con trazabilidad"]} actions={[{ label: "Seleccionar paciente", href: "/pacientes" }, { label: "Abrir planificación", href: "/planes" }]} />;
}

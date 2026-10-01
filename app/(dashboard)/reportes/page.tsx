import { ChartNoAxesCombined } from "lucide-react";
import { ModuleOverview } from "@/components/platform/module-overview";

export default function ReportsPage() {
  return <ModuleOverview title="Reportes" description="Métricas y líneas de tiempo creadas desde eventos idempotentes de cada dominio." service="reporting" icon={ChartNoAxesCombined} sources={[{ label: "Snapshots", path: "/v1/report-snapshots", empty: "No hay reportes generados" }]} capabilities={["Métricas diarias", "Evolución del paciente", "Línea de tiempo consolidada", "Inbox idempotente", "Reconstrucción de proyecciones", "Aislamiento por organización"]} actions={[{ label: "Seleccionar paciente", href: "/pacientes" }, { label: "Ver panel principal", href: "/dashboard" }]} />;
}

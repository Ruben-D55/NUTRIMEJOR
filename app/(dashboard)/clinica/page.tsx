import { Stethoscope } from "lucide-react";
import { ModuleOverview } from "@/components/platform/module-overview";

export default function ClinicalPage() {
  return <ModuleOverview title="Historia clínica" description="Consultas, antecedentes, diagnósticos, objetivos y seguimiento con publicación inmutable." service="clinical" icon={Stethoscope} capabilities={["Consultas versionadas", "Antecedentes y problemas", "Diagnósticos nutricionales", "Objetivos y seguimientos", "Correcciones auditadas", "Línea de tiempo clínica"]} actions={[{ label: "Seleccionar paciente", href: "/pacientes" }, { label: "Ver reportes", href: "/reportes" }]} />;
}

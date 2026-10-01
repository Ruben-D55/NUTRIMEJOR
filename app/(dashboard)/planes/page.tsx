import { ClipboardList } from "lucide-react";
import { ModuleOverview } from "@/components/platform/module-overview";

export default function PlansPage() {
  return <ModuleOverview title="Planes nutricionales" description="Requerimientos, distribución, menús, adecuación, sustituciones y listas de compra." service="planning" icon={ClipboardList} capabilities={["Mifflin-St Jeor y GET", "Objetivos de energía y macros", "Restricciones duras", "Generador Pro y Sport", "Revisión profesional obligatoria", "Publicación y versiones"]} actions={[{ label: "Seleccionar paciente", href: "/pacientes" }, { label: "Mis recetas", href: "/catalogos/recetas" }, { label: "Generar documentos", href: "/documentos" }]} />;
}

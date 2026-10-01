import { FileText } from "lucide-react";
import { ModuleOverview } from "@/components/platform/module-overview";

export default function DocumentsPage() {
  return <ModuleOverview title="Documentos" description="Plantillas y generación asíncrona de PDF con integridad y acceso temporal." service="documents" icon={FileText} sources={[{ label: "Documentos generados", path: "/v1/generated-documents", empty: "Aún no hay documentos" }, { label: "Plantillas", path: "/v1/templates", empty: "Aún no hay plantillas" }]} capabilities={["Generación PDF asíncrona", "Plantillas por organización", "SHA-256 y tipo de archivo", "URLs temporales", "Autorización por organización", "Cuota según membresía"]} actions={[{ label: "Abrir planes", href: "/planes" }, { label: "Seleccionar paciente", href: "/pacientes" }]} />;
}

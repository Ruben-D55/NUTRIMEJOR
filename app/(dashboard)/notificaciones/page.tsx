import { BellRing } from "lucide-react";
import { ModuleOverview } from "@/components/platform/module-overview";

export default function NotificationsPage() {
  return <ModuleOverview title="Notificaciones" description="Preferencias multicanal, reglas configurables, recordatorios, reintentos e historial de entregas." service="notifications" icon={BellRing} sources={[{ label: "Trabajos de envío", path: "/v1/notification-jobs", empty: "No hay envíos pendientes" }, { label: "Reglas de alerta", path: "/v1/alert-rules", empty: "No hay reglas configuradas" }]} capabilities={["Preferencias por paciente", "Ocho tipos de alerta configurables", "Canales desacoplados", "Reintentos controlados", "Intentos auditados", "Cola de mensajes fallidos", "Automatizaciones según plan"]} actions={[{ label: "Abrir agenda", href: "/agenda" }, { label: "Seleccionar paciente", href: "/pacientes" }]} />;
}

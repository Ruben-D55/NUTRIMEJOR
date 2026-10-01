import { CalendarDays } from "lucide-react";
import { ModuleOverview } from "@/components/platform/module-overview";

export default function SchedulingPage() {
  return <ModuleOverview title="Agenda" description="Disponibilidad, excepciones, citas sin solapamientos e historial de estados." service="scheduling" icon={CalendarDays} sources={[{ label: "Próximas citas", path: "/v1/appointments", empty: "No hay citas programadas" }, { label: "Disponibilidad", path: "/v1/availability", empty: "No hay reglas configuradas" }]} capabilities={["Reglas semanales", "Excepciones de disponibilidad", "Detección de conflictos", "Estados e historial auditable", "Eventos para recordatorios"]} actions={[{ label: "Ver pacientes", href: "/pacientes" }, { label: "Preferencias de avisos", href: "/notificaciones" }]} />;
}

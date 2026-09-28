import { BadgeCheck } from "lucide-react";
import { ModuleOverview } from "@/components/platform/module-overview";

export default function MembershipPage() {
  return <ModuleOverview title="Membresía" description="Plan, derechos, cuotas y ciclo de suscripción de la organización activa." service="subscriptions" icon={BadgeCheck} capabilities={["Prueba automática", "Planes Básica, Pro y Sport", "Derechos por capacidad", "Consumo atómico de cuotas", "Cancelación y reactivación", "Historial y eventos"]} actions={[{ label: "Configuración", href: "/configuracion" }, { label: "Abrir planificación", href: "/planes" }]} />;
}

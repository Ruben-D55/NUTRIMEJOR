import { redirect } from "next/navigation";
import Shell from "@/components/app-shell";
import { PatientProvider } from "@/components/patients/patient-provider";
import { callService } from "@/lib/server/service-client";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const response = await callService("identity", "/v1/sessions/me");
  if (response.status === 401) redirect("/api/auth/refresh?next=/dashboard");
  if (response.status === 403) redirect("/login");
  if (!response.ok) throw new Error("No se pudo validar la sesión con el servicio de identidad.");

  const { user } = await response.json();
  return (
    <PatientProvider>
      <Shell user={user}>{children}</Shell>
    </PatientProvider>
  );
}

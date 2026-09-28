import Link from "next/link";
import { AlertTriangle, Apple, CalendarDays, ClipboardList, FilePlus2, NotebookTabs, Ruler, Salad, Search, Stethoscope, UserPlus, Users } from "lucide-react";
import { callService, type ServiceName } from "@/lib/server/service-client";

type Patient = {
  id: string;
  names: string;
  lastNames: string;
  objective: string;
  status: "Activo" | "Inactivo";
  phone?: string;
  email?: string;
  birthDate?: string;
};

type Appointment = { id: string; startsAt?: string; startAt?: string; status?: string };
type NotificationJob = { id: string; status?: string };

async function collection<T>(service: ServiceName, path: string): Promise<T[]> {
  try {
    const response = await callService(service, path);
    if (!response.ok) return [];
    const value = await response.json();
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const key of ["items", "data", "appointments", "jobs"]) {
        if (Array.isArray(value[key])) return value[key];
      }
    }
    return [];
  } catch {
    return [];
  }
}

export default async function Dashboard() {
  const [patients, recipes, foods, diets, appointments, notificationJobs] = await Promise.all([
    collection<Patient>("patients", "/v1/patients"),
    collection("catalogs", "/v1/catalogs/recetas"),
    collection("catalogs", "/v1/catalogs/alimentos"),
    collection("catalogs", "/v1/catalogs/dietas"),
    collection<Appointment>("scheduling", "/v1/appointments"),
    collection<NotificationJob>("notifications", "/v1/notification-jobs"),
  ]);

  const activePatients = patients.filter((patient) => patient.status === "Activo");
  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = appointments.filter((appointment) =>
    (appointment.startsAt || appointment.startAt || "").startsWith(today),
  );
  const upcomingAppointments = appointments.filter((appointment) => {
    const startsAt = appointment.startsAt || appointment.startAt;
    return startsAt ? new Date(startsAt).getTime() > Date.now() : false;
  });
  const pendingAlerts = notificationJobs.filter((job) =>
    ["pending", "retry", "scheduled"].includes((job.status || "").toLowerCase()),
  );
  const incompletePatients = activePatients.filter((patient) =>
    !patient.birthDate || (!patient.phone && !patient.email),
  );
  const stats = [
    [Users, activePatients.length, "Pacientes activos"],
    [CalendarDays, todayAppointments.length, "Consultas de hoy"],
    [CalendarDays, upcomingAppointments.length, "Próximas consultas"],
    [AlertTriangle, pendingAlerts.length, "Alertas pendientes"],
    [Users, incompletePatients.length, "Fichas incompletas"],
    [NotebookTabs, recipes.length, "Recetas"],
    [Apple, foods.length, "Alimentos"],
    [Salad, diets.length, "Dietas"],
  ] as const;

  const shortcuts = [
    ["/pacientes/nuevo", "Nuevo paciente", UserPlus],
    ["/pacientes", "Buscar paciente", Search],
    ["/clinica", "Nueva consulta", Stethoscope],
    ["/mediciones", "Registrar antropometría", Ruler],
    ["/planes", "Crear plan", ClipboardList],
    ["/documentos", "Crear PDF", FilePlus2],
  ] as const;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-emerald-50 to-lime-50 p-8 dark:border-emerald-800 dark:from-emerald-900 dark:to-emerald-950">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
          Panel principal
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold">Buen día 👋</h1>
        <p className="mt-2 text-slate-500">Consulta la actividad actual de tu espacio de trabajo.</p>
        <Link
          href="/pacientes/nuevo"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo paciente
        </Link>
      </section>

      <section className="card p-6">
        <h2 className="font-display font-bold">Accesos rápidos</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map(([href, label, Icon]) => (
            <Link className="flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950" href={href} key={href}>
              <Icon className="h-5 w-5 text-emerald-700" />
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([Icon, value, title]) => (
          <article className="card flex items-center gap-4 p-5" key={title}>
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Icon />
            </div>
            <div>
              <b className="font-display text-2xl">{value}</b>
              <p className="text-xs text-slate-500">{title}</p>
            </div>
          </article>
        ))}
      </section>

      <article className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold">Pacientes recientes</h2>
          <Link href="/pacientes" className="text-sm font-semibold text-emerald-700">
            Ver todos
          </Link>
        </div>
        {patients.slice(0, 5).map((patient) => (
          <div
            className="mt-4 flex items-center gap-3 border-t pt-4 dark:border-emerald-800"
            key={patient.id}
          >
            <b className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xs dark:bg-emerald-950">
              {`${patient.names[0] || ""}${patient.lastNames[0] || ""}`.toUpperCase()}
            </b>
            <div>
              <strong className="text-sm">{patient.names} {patient.lastNames}</strong>
              <p className="text-xs text-slate-500">{patient.objective || "Objetivo sin definir"}</p>
            </div>
          </div>
        ))}
        {!patients.length && <p className="mt-5 text-sm text-slate-500">Todavía no hay pacientes registrados.</p>}
      </article>
    </div>
  );
}

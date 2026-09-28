"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, CalendarDays, ClipboardList, FileText, Ruler, Stethoscope, Utensils } from "lucide-react";
import { usePatients } from "@/components/patients/patient-provider";
import { fullName } from "@/lib/patients";

const areas = [
  { service: "clinical", path: (id: string) => `patients/${id}/timeline`, label: "Historia clínica", href: "/clinica", icon: Stethoscope },
  { service: "measurements", path: (id: string) => `measurement-sessions?patientId=${id}`, label: "Mediciones", href: "/mediciones", icon: Ruler },
  { service: "nutrition", path: (id: string) => `nutrition-assessments?patientId=${id}`, label: "Nutrición", href: "/nutricion", icon: Utensils },
  { service: "planning", path: (id: string) => `meal-plans?patientId=${id}`, label: "Planes", href: "/planes", icon: ClipboardList },
  { service: "scheduling", path: (id: string) => `appointments?patientId=${id}`, label: "Agenda", href: "/agenda", icon: CalendarDays },
  { service: "documents", path: (id: string) => `generated-documents?patientId=${id}`, label: "Documentos", href: "/documentos", icon: FileText },
] as const;

function itemCount(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["items", "data", "events", "timeline", "documents"]) {
      if (Array.isArray(record[key])) return record[key].length;
    }
  }
  return 0;
}

export default function PatientCarePage() {
  const { id } = useParams<{ id: string }>();
  const { patients, ready } = usePatients();
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const patient = patients.find((item) => item.id === id);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(areas.map(async (area) => {
      try {
        const response = await fetch(`/api/platform/${area.service}/${area.path(id)}`, { signal: controller.signal });
        return [area.service, response.ok ? itemCount(await response.json()) : null] as const;
      } catch {
        return [area.service, null] as const;
      }
    })).then((entries) => setCounts(Object.fromEntries(entries)));
    return () => controller.abort();
  }, [id]);

  if (!ready) return <p>Cargando…</p>;
  if (!patient) return <div className="card p-8">Paciente no encontrado.</div>;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border bg-gradient-to-br from-emerald-50 to-lime-50 p-7 dark:border-emerald-800 dark:from-emerald-900 dark:to-emerald-950">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-700 text-white"><Activity /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Atención integral</p>
            <h1 className="mt-1 font-display text-3xl font-bold">{fullName(patient)}</h1>
            <p className="mt-1 text-sm text-slate-500">Acceso unificado; cada área conserva su propia API y base de datos.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {areas.map((area) => {
          const Icon = area.icon;
          const count = counts[area.service];
          return (
            <Link className="card group p-5 transition hover:-translate-y-0.5 hover:border-emerald-400" href={`${area.href}?patientId=${id}`} key={area.service}>
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Icon className="h-5 w-5" /></span>
                <span className="text-2xl font-bold">{count === undefined ? "…" : count === null ? "—" : count}</span>
              </div>
              <h2 className="mt-4 font-semibold group-hover:text-emerald-700">{area.label}</h2>
              <p className="mt-1 text-xs text-slate-500">{count === null ? "Servicio no disponible" : "Registros vinculados"}</p>
            </Link>
          );
        })}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link className="rounded-xl border px-4 py-2 text-sm font-semibold dark:border-emerald-800" href={`/pacientes/${id}/historial`}>Historial administrativo</Link>
        <Link className="rounded-xl border px-4 py-2 text-sm font-semibold dark:border-emerald-800" href={`/pacientes/${id}/editar`}>Editar ficha</Link>
      </div>
    </div>
  );
}

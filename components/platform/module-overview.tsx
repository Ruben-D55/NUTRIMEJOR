import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { callService, type ServiceName } from "@/lib/server/service-client";

type Source = {
  label: string;
  path: string;
  empty: string;
};

type Action = {
  label: string;
  href: string;
};

function countItems(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["items", "data", "results", "appointments", "jobs", "documents", "snapshots"]) {
    if (Array.isArray(record[key])) return record[key].length;
  }
  return null;
}

async function readSource(service: ServiceName, source: Source) {
  try {
    const response = await callService(service, source.path);
    if (!response.ok) return { ...source, available: false, count: null };
    const value = await response.json();
    return { ...source, available: true, count: countItems(value) };
  } catch {
    return { ...source, available: false, count: null };
  }
}

export async function ModuleOverview({
  title,
  description,
  service,
  icon: Icon,
  sources = [],
  actions = [],
  capabilities,
}: {
  title: string;
  description: string;
  service: ServiceName;
  icon: LucideIcon;
  sources?: Source[];
  actions?: Action[];
  capabilities: string[];
}) {
  const summaries = await Promise.all(sources.map((source) => readSource(service, source)));

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border bg-gradient-to-br from-emerald-50 to-lime-50 p-7 dark:border-emerald-800 dark:from-emerald-900 dark:to-emerald-950">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white">
            <Icon className="h-7 w-7" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              Área de trabajo
            </p>
            <h1 className="mt-1 font-display text-3xl font-extrabold">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">{description}</p>
          </div>
        </div>
      </section>

      {summaries.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {summaries.map((summary) => (
            <article className="card p-5" key={summary.path}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">{summary.label}</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${summary.available ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-800"}`}>
                  {summary.available ? "Disponible" : "Sin respuesta"}
                </span>
              </div>
              <p className="mt-4 font-display text-3xl font-bold">
                {summary.count ?? (summary.available ? "✓" : "—")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {summary.count === 0 ? summary.empty : summary.count === null ? "Servicio conectado" : "registros visibles"}
              </p>
            </article>
          ))}
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <article className="card p-6">
          <h2 className="font-display text-lg font-bold">Capacidades implementadas</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <div className="flex items-start gap-2 text-sm" key={capability}>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{capability}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="card p-6">
          <h2 className="font-display text-lg font-bold">Acciones relacionadas</h2>
          <div className="mt-3 space-y-2">
            {actions.map((action) => (
              <Link className="flex items-center justify-between rounded-xl border p-3 text-sm font-semibold hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950" href={action.href} key={action.href}>
                {action.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CheckCircle2, Gauge, XCircle } from "lucide-react";
import { ConfirmDialog, EmptyState, ErrorAlert, LoadingState, StatusBadge } from "@/components/ui/workspace-ui";
import { CrudPageHeader, MetricCards } from "@/components/ui/crud-ui";
import { displayDate, platformRequest, recordList, type PlatformRecord } from "@/lib/platform-client";

type Choice = { type: "plan" | "cancel" | "reactivate"; code?: string; title: string; detail: string };
type Benefit = { code: string; name: string; measure?: string | null; enabled: boolean; quota?: number | null; used?: number; remaining?: number | null };

function benefitsOf(plan: PlatformRecord): Benefit[] {
  return Array.isArray(plan.features) ? plan.features as Benefit[] : [];
}

function benefitLimit(benefit: Benefit) {
  if (!benefit.enabled) return "No incluido";
  if (benefit.quota == null) return "Ilimitado";
  const units: Record<string, string> = { patients: "pacientes", documents: "documentos/mes", runs: "generaciones/mes" };
  return `Hasta ${benefit.quota} ${units[benefit.measure || ""] || benefit.measure || "usos"}`;
}

export function MembershipWorkspace() {
  const [plans, setPlans] = useState<PlatformRecord[]>([]);
  const [current, setCurrent] = useState<PlatformRecord | null>(null);
  const [features, setFeatures] = useState<Benefit[]>([]);
  const [history, setHistory] = useState<PlatformRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [plansResponse, currentResponse, entitlementResponse, historyResponse] = await Promise.all([
        platformRequest("/api/platform/subscriptions/plans"),
        platformRequest<PlatformRecord>("/api/platform/subscriptions/subscriptions/current"),
        platformRequest("/api/platform/subscriptions/entitlements"),
        platformRequest("/api/platform/subscriptions/subscriptions/current/history"),
      ]);
      const entitlement = entitlementResponse as Record<string, unknown>;
      setPlans(recordList(plansResponse));
      setCurrent(currentResponse);
      setFeatures(Array.isArray(entitlement.features) ? entitlement.features as Benefit[] : []);
      setHistory(recordList(historyResponse));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la membresía.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function apply() {
    if (!choice) return;
    try {
      setSaving(true);
      const url = choice.type === "plan" ? "/api/platform/subscriptions/subscriptions/current" : `/api/platform/subscriptions/subscriptions/current/${choice.type}`;
      await platformRequest(url, {
        method: choice.type === "plan" ? "PUT" : "POST",
        body: JSON.stringify(choice.type === "plan" ? { planCode: choice.code } : choice.type === "cancel" ? { reason: "Solicitada desde el portal" } : {}),
      });
      setChoice(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar la membresía.");
      setChoice(null);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Cargando membresía…"/>;
  const enabledFeatures = features.filter((feature) => feature.enabled);

  return <section>
    <CrudPageHeader eyebrow="Suscripción" title="Membresía" description="Compara los beneficios, revisa tus cuotas y administra el plan del consultorio."/>
    <MetricCards metrics={[
      { label: "Plan actual", value: String(current?.planCode || "Sin plan"), detail: "Suscripción vigente" },
      { label: "Beneficios", value: enabledFeatures.length, detail: "Funciones habilitadas", tone: "blue" },
      { label: "Planes", value: plans.length, detail: "Opciones disponibles", tone: "amber" },
      { label: "Cambios", value: history.length, detail: "En el historial", tone: "slate" },
    ]}/>
    {error && <ErrorAlert message={error} onRetry={() => void load()}/>}

    {current && <div className="card mt-6 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-slate-500">Plan actual</p>
        <div className="mt-1 flex items-center gap-3"><h2 className="font-display text-2xl font-bold">{String(current.planCode)}</h2><StatusBadge value={current.status}/></div>
        <p className="mt-2 text-sm text-slate-500">{current.status === "trialing" ? `Prueba hasta ${displayDate(current.trialEndsAt)}` : `Periodo hasta ${displayDate(current.periodEndsAt)}`}</p>
      </div>
      {current.status === "canceled"
        ? <button className="primary-button" onClick={() => setChoice({ type: "reactivate", title: "Reactivar membresía", detail: "Se reactivará el plan anterior con un nuevo periodo." })}>Reactivar</button>
        : <button className="danger-button" onClick={() => setChoice({ type: "cancel", title: "Cancelar membresía", detail: "Las funciones y cuotas del plan quedarán desactivadas." })}>Cancelar plan</button>}
    </div>}

    <div className="mt-8">
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Comparación</p>
      <h2 className="mt-1 font-display text-2xl font-bold">Beneficios de cada plan</h2>
      <p className="mt-2 text-sm text-slate-500">Revisa qué incluye cada opción antes de cambiar la membresía.</p>
    </div>
    {!plans.length ? <EmptyState title="No hay planes" detail="El catálogo de membresías no está disponible."/> : <div className="mt-4 grid items-start gap-4 lg:grid-cols-3">
      {plans.map((plan) => {
        const benefits = benefitsOf(plan);
        const isCurrent = current?.planCode === plan.code;
        return <article className={`card overflow-hidden ${isCurrent ? "ring-2 ring-emerald-600" : ""}`} key={String(plan.code)}>
          <div className="border-b p-6 dark:border-emerald-800">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Plan {String(plan.code)}</p><h3 className="mt-1 font-display text-2xl font-bold">{String(plan.name || plan.code)}</h3></div>
              {isCurrent && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Actual</span>}
            </div>
            <p className="mt-3 min-h-12 text-sm leading-6 text-slate-500">{String(plan.description || "Funciones y cuotas adaptadas a tu práctica.")}</p>
          </div>
          <ul className="grid gap-1 p-4" aria-label={`Beneficios del plan ${String(plan.name || plan.code)}`}>
            {benefits.map((benefit) => <li className={`flex items-start gap-3 rounded-xl p-3 ${benefit.enabled ? "bg-emerald-50/70 dark:bg-emerald-950" : "text-slate-400"}`} key={benefit.code}>
              {benefit.enabled ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true"/> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true"/>}
              <div><span className="block text-sm font-semibold">{benefit.name}</span><small>{benefitLimit(benefit)}</small></div>
            </li>)}
          </ul>
          <div className="p-4 pt-0">
            <button disabled={isCurrent} className={`w-full ${isCurrent ? "secondary-button" : "primary-button"}`} onClick={() => setChoice({ type: "plan", code: String(plan.code), title: `Cambiar a ${String(plan.name || plan.code)}`, detail: `Se activarán los beneficios y cuotas del plan ${String(plan.name || plan.code)}.` })}>
              <Check className="h-4 w-4"/>{isCurrent ? "Plan actual" : "Seleccionar plan"}
            </button>
          </div>
        </article>;
      })}
    </div>}

    <div className="mt-8 grid gap-5 lg:grid-cols-2">
      <section className="card p-6">
        <div className="flex items-center gap-3"><Gauge className="h-6 w-6 text-emerald-700"/><div><h2 className="font-display text-xl font-bold">Uso del plan actual</h2><p className="text-sm text-slate-500">Consumo y disponibilidad del periodo vigente.</p></div></div>
        {!features.length ? <p className="mt-4 text-sm text-slate-500">Sin funciones registradas.</p> : <ul className="mt-5 grid gap-4">
          {features.map((feature) => {
            const percentage = feature.enabled && feature.quota ? Math.min(100, Math.round(((feature.used || 0) / feature.quota) * 100)) : 0;
            return <li className="rounded-xl border p-4 dark:border-emerald-800" key={feature.code}>
              <div className="flex items-start justify-between gap-3"><div><span className="font-semibold">{feature.name}</span><small className="mt-1 block text-slate-500">{benefitLimit(feature)}</small></div><StatusBadge value={feature.enabled ? "active" : "inactive"}/></div>
              {feature.enabled && feature.quota != null && <><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-emerald-950"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${percentage}%` }}/></div><p className="mt-2 text-xs text-slate-500">{feature.used || 0} usados · {feature.remaining ?? Math.max(0, feature.quota - (feature.used || 0))} disponibles</p></>}
            </li>;
          })}
        </ul>}
      </section>
      <section className="card p-6">
        <h2 className="font-display text-xl font-bold">Historial de membresía</h2>
        <p className="mt-1 text-sm text-slate-500">Activaciones, cambios y cancelaciones.</p>
        {!history.length ? <p className="mt-4 text-sm text-slate-500">Sin cambios de membresía.</p> : <ol className="mt-5 grid gap-3">
          {history.slice(-8).reverse().map((item, index) => <li className="border-l-2 border-emerald-500 pl-3 text-sm" key={`${String(item.changedAt)}-${index}`}><b>{String(item.newPlanCode || item.planCode || item.newStatus)}</b><span className="block text-slate-500">{String(item.reason || item.newStatus || "Cambio de membresía")} · {displayDate(item.changedAt)}</span></li>)}
        </ol>}
      </section>
    </div>
    {choice && <ConfirmDialog title={choice.title} detail={choice.detail} confirmLabel={choice.type === "cancel" ? "Cancelar plan" : "Confirmar cambio"} busy={saving} onCancel={() => setChoice(null)} onConfirm={() => void apply()}/>}
  </section>;
}

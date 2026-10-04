"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Edit3, Loader2, Plus } from "lucide-react";
import { usePatients } from "@/components/patients/patient-provider";
import { ConfirmDialog, EmptyState, ErrorAlert, LoadingState, Pagination, StatusBadge } from "@/components/ui/workspace-ui";
import { CrudPageHeader, DataToolbar, Drawer, ExportButton, FilterChip, MetricCards, PageSizeSelect } from "@/components/ui/crud-ui";
import { dateInput, displayDate, platformRequest, recordList, type PlatformRecord } from "@/lib/platform-client";
import { fullName } from "@/lib/patients";

type Kind = "clinical" | "nutrition" | "scheduling" | "notifications" | "documents" | "reporting";
type Values = Record<string, string>;
type Config = { title: string; eyebrow: string; description: string; service: string; path: string; singular: string; dateKey: string; editable?: boolean; action?: { label: string; path: (record: PlatformRecord) => string; body: (record: PlatformRecord) => unknown } };

const configs: Record<Kind, Config> = {
  clinical: { title: "Historia clínica", eyebrow: "Atención", description: "Registra, edita y publica consultas con historial auditable.", service: "clinical", path: "consultations", singular: "consulta", dateKey: "occurredAt", editable: true, action: { label: "Publicar", path: (r) => `consultations/${r.id}/publish`, body: (r) => ({ expectedVersion: Number(r.version || 1), reason: "Validada desde el portal clínico" }) } },
  nutrition: { title: "Evaluación nutricional", eyebrow: "Nutrición", description: "Documenta el estilo de vida y completa la evaluación nutricional.", service: "nutrition", path: "nutrition-assessments", singular: "evaluación", dateKey: "assessedAt", action: { label: "Completar", path: (r) => `nutrition-assessments/${r.id}/complete`, body: (r) => ({ expectedVersion: Number(r.version || 1) }) } },
  scheduling: { title: "Agenda", eyebrow: "Agenda", description: "Programa citas y actualiza su estado con control de conflictos.", service: "scheduling", path: "appointments", singular: "cita", dateKey: "startsAt", action: { label: "Confirmar", path: (r) => `appointments/${r.id}/status`, body: (r) => ({ expectedVersion: Number(r.version || 1), status: "confirmed" }) } },
  notifications: { title: "Notificaciones", eyebrow: "Comunicación", description: "Administra avisos internos y su ciclo de entrega.", service: "notifications", path: "notifications", singular: "notificación", dateKey: "createdAt", editable: true },
  documents: { title: "Documentos", eyebrow: "Documentación", description: "Administra solicitudes y metadatos documentales por paciente.", service: "documents", path: "documents", singular: "documento", dateKey: "createdAt", editable: true },
  reporting: { title: "Reportes", eyebrow: "Análisis", description: "Crea y mantiene reportes clínicos y administrativos.", service: "reporting", path: "report-snapshots", singular: "reporte", dateKey: "createdAt", editable: true },
};

function initialValues(kind: Kind, record?: PlatformRecord): Values {
  const data = (record?.data && typeof record.data === "object" ? record.data : {}) as Record<string, unknown>;
  return {
    patientId: String(record?.patientId || ""), title: String(record?.title || ""), status: String(record?.status || "draft"),
    type: String(record?.consultationType || record?.assessmentType || record?.type || (kind === "clinical" ? "initial" : kind === "nutrition" ? "comprehensive" : "follow_up")),
    occurredAt: dateInput(record?.occurredAt), assessedAt: dateInput(record?.assessedAt), startsAt: dateInput(record?.startsAt),
    endsAt: dateInput(record?.endsAt || new Date(Date.now() + 3_600_000)), location: String(record?.location || ""),
    details: String(data.details || data.notes || record?.notes || ""), dailyActivity: String((record?.lifestyle as Record<string, unknown> | undefined)?.dailyActivity || ""),
    sleepHours: String((record?.lifestyle as Record<string, unknown> | undefined)?.sleepHours || ""), physicalActivity: String((record?.lifestyle as Record<string, unknown> | undefined)?.physicalActivity || ""),
  };
}

function buildBody(kind: Kind, values: Values, record?: PlatformRecord) {
  if (kind === "clinical") return { patientId: values.patientId, title: values.title.trim(), consultationType: values.type, occurredAt: new Date(values.occurredAt).toISOString(), data: { notes: values.details.trim() }, ...(record ? { expectedVersion: Number(record.version || 1) } : {}) };
  if (kind === "nutrition") return { patientId: values.patientId, title: values.title.trim(), assessmentType: values.type, assessedAt: new Date(values.assessedAt).toISOString(), lifestyle: { dailyActivity: values.dailyActivity.trim(), sleepHours: Number(values.sleepHours || 0), physicalActivity: values.physicalActivity.trim(), otherVariables: {} } };
  if (kind === "scheduling") return { patientId: values.patientId, title: values.title.trim(), type: values.type, startsAt: new Date(values.startsAt).toISOString(), endsAt: new Date(values.endsAt).toISOString(), timeZone: "America/La_Paz", location: values.location.trim(), notes: values.details.trim() };
  return { patientId: values.patientId || undefined, title: values.title.trim(), status: values.status, data: { details: values.details.trim() } };
}

export function ModuleCrud({ kind }: { kind: Kind }) {
  const config = configs[kind];
  const { patients, ready: patientsReady } = usePatients();
  const [rows, setRows] = useState<PlatformRecord[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [status, setStatus] = useState("all"), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<PlatformRecord | null | undefined>(undefined), [values, setValues] = useState<Values>(() => initialValues(kind));
  const [formError, setFormError] = useState(""), [saving, setSaving] = useState(false), [confirming, setConfirming] = useState<PlatformRecord | null>(null);
  const endpoint = `/api/platform/${config.service}/${config.path}`;
  const load = useCallback(async () => { try { setLoading(true); setError(""); setRows(recordList(await platformRequest(endpoint))); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar la información."); } finally { setLoading(false); } }, [endpoint]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => rows.filter((row) => {
    const haystack = [row.title, row.status, row.type, row.consultationType, row.assessmentType, patients.find((p) => p.id === row.patientId) && fullName(patients.find((p) => p.id === row.patientId)!)].join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase()) && (status === "all" || String(row.status) === status);
  }), [rows, query, status, patients]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [query, status, pageSize]);

  function open(record?: PlatformRecord) { setEditing(record || null); setValues(initialValues(kind, record)); setFormError(""); }
  function validate() {
    if (!values.title.trim()) return "Escribe un título descriptivo.";
    if (["clinical", "nutrition", "scheduling"].includes(kind) && !values.patientId) return "Selecciona un paciente.";
    if (kind === "scheduling" && new Date(values.endsAt) <= new Date(values.startsAt)) return "La hora de fin debe ser posterior al inicio.";
    if (kind === "nutrition" && !values.dailyActivity.trim()) return "Describe la actividad diaria del paciente.";
    return "";
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); const validation = validate(); if (validation) { setFormError(validation); return; }
    try { setSaving(true); setFormError(""); await platformRequest(`${endpoint}${editing ? `/${editing.id}` : ""}`, { method: editing ? "PUT" : "POST", body: JSON.stringify(buildBody(kind, values, editing || undefined)) }); setEditing(undefined); await load(); } catch (e) { setFormError(e instanceof Error ? e.message : "No se pudo guardar."); } finally { setSaving(false); }
  }
  async function executeAction() {
    if (!confirming || !config.action) return;
    try { setSaving(true); setError(""); await platformRequest(`/api/platform/${config.service}/${config.action.path(confirming)}`, { method: "POST", body: JSON.stringify(config.action.body(confirming)) }); setConfirming(null); await load(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar la acción."); setConfirming(null); } finally { setSaving(false); }
  }
  const statuses = [...new Set(rows.map((r) => String(r.status || "draft")))];
  const formDirty = JSON.stringify(values) !== JSON.stringify(initialValues(kind, editing || undefined));
  return <section>
    <CrudPageHeader eyebrow={config.eyebrow} title={config.title} description={config.description} action={<button className="primary-button" onClick={() => open()}><Plus className="h-4 w-4"/>Nueva {config.singular}</button>}/>
    <MetricCards metrics={[{label:"Total",value:rows.length,detail:"Registros del módulo"},{label:"Activos",value:rows.filter((row)=>["active","published","completed","confirmed"].includes(String(row.status))).length,detail:"Listos o vigentes",tone:"blue"},{label:"Pendientes",value:rows.filter((row)=>["draft","scheduled","pending"].includes(String(row.status))).length,detail:"Requieren atención",tone:"amber"},{label:"Recientes",value:rows.filter((row)=>Date.now()-Date.parse(String(row.createdAt||row[config.dateKey]||0))<30*86_400_000).length,detail:"Últimos 30 días",tone:"slate"}]}/>
    {error && <ErrorAlert message={error} onRetry={() => void load()}/>}
    <div className="card mt-5 overflow-visible"><DataToolbar searchLabel="Buscar por título, paciente o estado" searchValue={query} onSearch={setQuery} trailing={<><PageSizeSelect value={pageSize} onChange={setPageSize}/><ExportButton filename={`${config.path}.csv`} rows={filtered.map((row)=>({titulo:row.title,paciente:patientName(row,patients),fecha:displayDate(row[config.dateKey]||row.createdAt),estado:row.status}))}/></>}/><div className="flex flex-wrap gap-2 border-b px-4 py-3 dark:border-emerald-800 sm:px-5"><FilterChip active={status==="all"} onClick={()=>setStatus("all")}>Todos</FilterChip>{statuses.map((item)=><FilterChip active={status===item} onClick={()=>setStatus(item)} key={item}>{item.replaceAll("_"," ")}</FilterChip>)}</div>
      {loading || !patientsReady ? <LoadingState/> : visible.length === 0 ? <EmptyState title="Sin registros" detail={query || status !== "all" ? "Cambia los filtros para ampliar la búsqueda." : `Crea la primera ${config.singular} para comenzar.`}/> : <><div className="hidden overflow-x-auto md:block"><table className="data-table w-full min-w-[760px] text-left text-sm"><thead><tr><th className="p-4">Título</th><th>Paciente</th><th>Fecha</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{visible.map((row) => <Row key={row.id} row={row} patients={patients} dateKey={config.dateKey} actionLabel={config.action?.label} onEdit={config.editable ? () => open(row) : undefined} onAction={() => setConfirming(row)}/>)}</tbody></table></div><div className="grid gap-3 p-4 md:hidden">{visible.map((row) => <MobileRow key={row.id} row={row} patients={patients} dateKey={config.dateKey} actionLabel={config.action?.label} onEdit={config.editable ? () => open(row) : undefined} onAction={() => setConfirming(row)}/>)}</div><Pagination page={page} pages={pages} total={filtered.length} onChange={setPage}/></>}
    </div>
    {editing !== undefined && <Drawer title={`${editing ? "Editar" : "Nueva"} ${config.singular}`} description="Los campos marcados son obligatorios." dirty={formDirty} onClose={() => setEditing(undefined)}><form className="grid gap-4" onSubmit={save} noValidate><label>Título *<input className="field" value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} aria-invalid={!!formError && !values.title.trim()}/></label>{["clinical", "nutrition", "scheduling", "notifications", "documents", "reporting"].includes(kind) && <label>Paciente {["clinical", "nutrition", "scheduling"].includes(kind) ? "*" : "(opcional)"}<select className="field" value={values.patientId} onChange={(e) => setValues({ ...values, patientId: e.target.value })}><option value="">Selecciona un paciente</option>{patients.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</select></label>}{kind === "clinical" && <><label>Tipo<select className="field" value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })}><option value="initial">Inicial</option><option value="follow_up">Seguimiento</option><option value="nutritional_control">Control nutricional</option><option value="closure">Cierre</option></select></label><DateField label="Fecha de consulta" name="occurredAt" values={values} setValues={setValues}/></>}{kind === "nutrition" && <><label>Tipo<select className="field" value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })}><option value="comprehensive">Integral</option><option value="lifestyle">Estilo de vida</option><option value="dietary">Dietética</option></select></label><DateField label="Fecha de evaluación" name="assessedAt" values={values} setValues={setValues}/><label>Actividad diaria *<input className="field" value={values.dailyActivity} onChange={(e) => setValues({ ...values, dailyActivity: e.target.value })}/></label><label>Horas de sueño<input type="number" min="0" max="24" step="0.5" className="field" value={values.sleepHours} onChange={(e) => setValues({ ...values, sleepHours: e.target.value })}/></label><label>Actividad física<input className="field" value={values.physicalActivity} onChange={(e) => setValues({ ...values, physicalActivity: e.target.value })}/></label></>}{kind === "scheduling" && <><label>Tipo<select className="field" value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })}><option value="initial">Inicial</option><option value="follow_up">Seguimiento</option><option value="control">Control</option><option value="other">Otro</option></select></label><div className="grid gap-4 sm:grid-cols-2"><DateField label="Inicio" name="startsAt" values={values} setValues={setValues}/><DateField label="Fin" name="endsAt" values={values} setValues={setValues}/></div><label>Ubicación<input className="field" value={values.location} onChange={(e) => setValues({ ...values, location: e.target.value })}/></label></>}{!["clinical", "nutrition", "scheduling"].includes(kind) && <label>Estado<select className="field" value={values.status} onChange={(e) => setValues({ ...values, status: e.target.value })}><option value="draft">Borrador</option><option value="active">Activo</option><option value="ready">Listo</option><option value="archived">Archivado</option></select></label>}{kind !== "nutrition" && <label>Detalles<textarea className="field py-3" rows={4} value={values.details} onChange={(e) => setValues({ ...values, details: e.target.value })}/></label>}{formError && <p className="field-error" role="alert">{formError}</p>}<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="secondary-button" onClick={() => { if (!formDirty || window.confirm("Hay cambios sin guardar. ¿Quieres cerrar el formulario?")) setEditing(undefined); }}>Cancelar</button><button className="primary-button" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin"/>}{saving ? "Guardando…" : "Guardar"}</button></div></form></Drawer>}
    {confirming && config.action && <ConfirmDialog title={`${config.action.label} ${config.singular}`} detail={`Se actualizará “${String(confirming.title)}” y quedará registrado en el historial.`} confirmLabel={config.action.label} busy={saving} onCancel={() => setConfirming(null)} onConfirm={() => void executeAction()}/>}
  </section>;
}

function DateField({ label, name, values, setValues }: { label: string; name: string; values: Values; setValues: (v: Values) => void }) { return <label>{label} *<input type="datetime-local" className="field" value={values[name]} onChange={(e) => setValues({ ...values, [name]: e.target.value })}/></label>; }
function patientName(row: PlatformRecord, patients: ReturnType<typeof usePatients>["patients"]) { const p = patients.find((item) => item.id === row.patientId); return p ? fullName(p) : "Sin paciente"; }
function Row({ row, patients, dateKey, actionLabel, onEdit, onAction }: { row: PlatformRecord; patients: ReturnType<typeof usePatients>["patients"]; dateKey: string; actionLabel?: string; onEdit?: () => void; onAction: () => void }) { const actionable = actionLabel && !["published", "completed", "confirmed"].includes(String(row.status)); return <tr className="border-t dark:border-emerald-800"><td className="p-4 font-semibold">{String(row.title || "Sin título")}</td><td>{patientName(row, patients)}</td><td>{displayDate(row[dateKey] || row.createdAt)}</td><td><StatusBadge value={row.status}/></td><td><div className="flex justify-end gap-2 pr-4">{onEdit && <button className="icon-button" aria-label={`Editar ${String(row.title)}`} onClick={onEdit}><Edit3 className="h-4 w-4"/></button>}{actionable && <button className="secondary-button !px-3" onClick={onAction}><CheckCircle2 className="h-4 w-4"/>{actionLabel}</button>}</div></td></tr>; }
function MobileRow({ row, patients, dateKey, actionLabel, onEdit, onAction }: Parameters<typeof Row>[0]) { const actionable = actionLabel && !["published", "completed", "confirmed"].includes(String(row.status)); return <article className="rounded-xl border p-4 dark:border-emerald-800"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{String(row.title || "Sin título")}</h2><p className="mt-1 text-sm text-slate-500">{patientName(row, patients)}</p></div><StatusBadge value={row.status}/></div><p className="mt-3 text-sm text-slate-500">{displayDate(row[dateKey] || row.createdAt)}</p><div className="mt-4 flex gap-2">{onEdit && <button className="secondary-button flex-1" onClick={onEdit}><Edit3 className="h-4 w-4"/>Editar</button>}{actionable && <button className="primary-button flex-1" onClick={onAction}>{actionLabel}</button>}</div></article>; }

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Archive, Clock3, Copy, Edit3, Eye, MoreHorizontal, Plus } from "lucide-react";
import type { Patient } from "@/lib/patients";
import { fullName } from "@/lib/patients";
import { usePatients } from "@/components/patients/patient-provider";
import { ConfirmDialog, EmptyState, ErrorAlert, LoadingState, Pagination, StatusBadge } from "@/components/ui/workspace-ui";
import { BulkActionBar, ColumnChooser, CrudPageHeader, DataToolbar, Drawer, ExportButton, FilterChip, MetricCards, PageSizeSelect } from "@/components/ui/crud-ui";

const columns = [
  { key: "patient", label: "Paciente" }, { key: "contact", label: "Contacto" },
  { key: "objective", label: "Objetivo" }, { key: "location", label: "Ubicación" },
  { key: "updated", label: "Actividad" }, { key: "status", label: "Estado" },
];

export default function PatientsPage() {
  const { patients, ready, error, remove, add } = usePatients();
  const [query, setQuery] = useState(""), [status, setStatus] = useState("all"), [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  const [visibleColumns, setVisibleColumns] = useState(columns.map((column) => column.key));
  const [selected, setSelected] = useState<string[]>([]), [viewing, setViewing] = useState<Patient | null>(null);
  const [archiving, setArchiving] = useState<Patient[] | null>(null), [actionError, setActionError] = useState(""), [busy, setBusy] = useState(false);
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return patients.filter((patient) => [fullName(patient), patient.preferredName, patient.document, patient.email, patient.city, patient.objective].join(" ").toLowerCase().includes(normalized) && (status === "all" || patient.status === status)).sort((a, b) => {
      if (sort === "name") return fullName(a).localeCompare(fullName(b), "es");
      if (sort === "oldest") return Date.parse(a.updatedAt || a.createdAt) - Date.parse(b.updatedAt || b.createdAt);
      return Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt);
    });
  }, [patients, query, status, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)), visible = rows.slice((page - 1) * pageSize, page * pageSize);
  const incomplete = patients.filter((patient) => !patient.birthDate || !patient.email || !patient.objective).length;
  const recent = patients.filter((patient) => Date.now() - Date.parse(patient.updatedAt || patient.createdAt) < 30 * 86_400_000).length;
  useEffect(() => setPage(1), [query, status, sort, pageSize]);

  function toggleSelected(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function togglePage() { const ids = visible.map((patient) => patient.id); setSelected((current) => ids.every((id) => current.includes(id)) ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]); }
  async function archive() { if (!archiving) return; try { setBusy(true); setActionError(""); await Promise.all(archiving.map((patient) => remove(patient.id))); setSelected([]); setArchiving(null); } catch (cause) { setActionError(cause instanceof Error ? cause.message : "No se pudo archivar la selección."); setArchiving(null); } finally { setBusy(false); } }
  async function duplicate(patient: Patient) {
    try {
      setBusy(true); setActionError("");
      await add({ names: patient.names, lastNames: `${patient.lastNames} (copia)`, preferredName: patient.preferredName, documentType: patient.documentType, document: "", birthDate: patient.birthDate, sex: patient.sex, phone: patient.phone, email: "", address: patient.address, city: patient.city, country: patient.country, objective: patient.objective, photoPath: patient.photoPath, status: "Activo", version: 1, updatedAt: "" });
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "No se pudo duplicar la ficha."); } finally { setBusy(false); }
  }
  const has = (key: string) => visibleColumns.includes(key);

  return <section>
    <CrudPageHeader eyebrow="Pacientes" title="Mis pacientes" description="Administra las fichas, revisa su actividad y accede rápidamente a la atención integral." action={<Link href="/pacientes/nuevo" className="primary-button"><Plus className="h-4 w-4"/>Nuevo paciente</Link>}/>
    <MetricCards metrics={[
      { label: "Total", value: patients.length, detail: "Fichas registradas" },
      { label: "Activos", value: patients.filter((patient) => patient.status === "Activo").length, detail: "En seguimiento", tone: "blue" },
      { label: "Fichas incompletas", value: incomplete, detail: "Requieren revisión", tone: "amber" },
      { label: "Actividad reciente", value: recent, detail: "Últimos 30 días", tone: "slate" },
    ]}/>
    {(error || actionError) && <ErrorAlert message={error || actionError}/>}
    <div className="card mt-5 overflow-visible">
      <DataToolbar searchLabel="Buscar por nombre, documento, correo, ciudad u objetivo" searchValue={query} onSearch={setQuery} trailing={<><PageSizeSelect value={pageSize} onChange={setPageSize}/><ColumnChooser columns={columns} visible={visibleColumns} onToggle={(key) => setVisibleColumns((current) => current.includes(key) && current.length > 1 ? current.filter((item) => item !== key) : current.includes(key) ? current : [...current, key])}/><ExportButton filename="pacientes.csv" rows={rows.map((patient) => ({ paciente: fullName(patient), documento: patient.document, correo: patient.email, telefono: patient.phone, objetivo: patient.objective, ciudad: patient.city, estado: patient.status }))}/></>}>
        <select aria-label="Ordenar pacientes" className="field !mt-0 sm:max-w-48" value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">Actividad reciente</option><option value="name">Nombre A–Z</option><option value="oldest">Más antiguos</option></select>
      </DataToolbar>
      <div className="flex flex-wrap gap-2 border-b px-4 py-3 dark:border-emerald-800 sm:px-5"><FilterChip active={status === "all"} onClick={() => setStatus("all")}>Todos {patients.length}</FilterChip><FilterChip active={status === "Activo"} onClick={() => setStatus("Activo")}>Activos</FilterChip><FilterChip active={status === "Inactivo"} onClick={() => setStatus("Inactivo")}>Archivados</FilterChip></div>
      {!ready ? <LoadingState label="Cargando pacientes…"/> : rows.length === 0 ? <EmptyState title="No se encontraron pacientes" detail={query || status !== "all" ? "Cambia la búsqueda o los filtros." : "Crea la primera ficha administrativa para comenzar."}/> : <>
        <div className="hidden overflow-x-auto md:block"><table className="data-table w-full min-w-[850px] text-left text-sm"><thead><tr><th className="w-12 p-4"><input aria-label="Seleccionar página" type="checkbox" checked={visible.length > 0 && visible.every((patient) => selected.includes(patient.id))} onChange={togglePage}/></th>{has("patient") && <th>Paciente</th>}{has("contact") && <th>Contacto</th>}{has("objective") && <th>Objetivo</th>}{has("location") && <th>Ubicación</th>}{has("updated") && <th>Actividad</th>}{has("status") && <th>Estado</th>}<th className="w-16"><span className="sr-only">Acciones</span></th></tr></thead><tbody>{visible.map((patient) => <tr key={patient.id}><td className="p-4"><input aria-label={`Seleccionar ${fullName(patient)}`} type="checkbox" checked={selected.includes(patient.id)} onChange={() => toggleSelected(patient.id)}/></td>{has("patient") && <td><PatientIdentity patient={patient}/></td>}{has("contact") && <td>{patient.phone || "—"}<small className="block text-slate-500">{patient.email || "Sin correo"}</small></td>}{has("objective") && <td className="max-w-56 truncate">{patient.objective || "Sin definir"}</td>}{has("location") && <td>{patient.city || "—"}</td>}{has("updated") && <td>{formatDate(patient.updatedAt || patient.createdAt)}</td>}{has("status") && <td><StatusBadge value={patient.status}/></td>}<td><PatientActions patient={patient} onView={() => setViewing(patient)} onDuplicate={() => void duplicate(patient)} onArchive={() => setArchiving([patient])}/></td></tr>)}</tbody></table></div>
        <div className="grid gap-3 p-4 md:hidden">{visible.map((patient) => <article className={`rounded-2xl border p-4 ${selected.includes(patient.id) ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950" : "dark:border-emerald-800"}`} key={patient.id}><div className="flex items-start gap-3"><input aria-label={`Seleccionar ${fullName(patient)}`} type="checkbox" checked={selected.includes(patient.id)} onChange={() => toggleSelected(patient.id)}/><div className="min-w-0 flex-1"><PatientIdentity patient={patient}/><p className="mt-3 truncate text-sm text-slate-500">{patient.objective || "Sin objetivo definido"}</p><div className="mt-3 flex items-center justify-between"><StatusBadge value={patient.status}/><PatientActions patient={patient} onView={() => setViewing(patient)} onDuplicate={() => void duplicate(patient)} onArchive={() => setArchiving([patient])}/></div></div></div></article>)}</div>
        <Pagination page={page} pages={pages} total={rows.length} onChange={setPage}/>
        <BulkActionBar count={selected.length} onClear={() => setSelected([])}><button className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-950" onClick={() => setArchiving(patients.filter((patient) => selected.includes(patient.id)))}><Archive className="mr-2 inline h-4 w-4"/>Archivar</button></BulkActionBar>
      </>}
    </div>
    {viewing && <Drawer title={fullName(viewing)} description="Ficha rápida del paciente" onClose={() => setViewing(null)}><PatientDetail patient={viewing}/></Drawer>}
    {archiving && <ConfirmDialog title={archiving.length > 1 ? "Archivar pacientes" : "Archivar paciente"} detail={archiving.length > 1 ? `${archiving.length} fichas dejarán de aparecer entre los pacientes activos.` : `La ficha de ${fullName(archiving[0])} quedará archivada.`} confirmLabel="Archivar" busy={busy} onCancel={() => setArchiving(null)} onConfirm={() => void archive()}/>}
  </section>;
}

function PatientIdentity({ patient }: { patient: Patient }) { const initials = `${patient.names[0] || ""}${patient.lastNames[0] || ""}`.toUpperCase(); return <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-100 font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{patient.photoPath ? <img className="h-full w-full object-cover" src={patient.photoPath} alt=""/> : initials}</span><div className="min-w-0"><strong className="block truncate">{fullName(patient)}</strong><small className="text-slate-500">{age(patient.birthDate)} · {patient.document || "Sin documento"}</small></div></div>; }
function PatientActions({ patient, onView, onDuplicate, onArchive }: { patient: Patient; onView: () => void; onDuplicate: () => void; onArchive: () => void }) { return <details className="relative"><summary className="icon-button cursor-pointer list-none" aria-label={`Acciones de ${fullName(patient)}`}><MoreHorizontal className="h-4 w-4"/></summary><div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border bg-white p-2 shadow-xl dark:border-emerald-700 dark:bg-emerald-900"><button className="action-menu-item" onClick={onView}><Eye className="h-4 w-4"/>Ver ficha</button><Link className="action-menu-item" href={`/pacientes/${patient.id}/atencion`}><Activity className="h-4 w-4"/>Atención integral</Link><Link className="action-menu-item" href={`/pacientes/${patient.id}/historial`}><Clock3 className="h-4 w-4"/>Historial</Link><Link className="action-menu-item" href={`/pacientes/${patient.id}/editar`}><Edit3 className="h-4 w-4"/>Editar</Link><button className="action-menu-item" onClick={onDuplicate}><Copy className="h-4 w-4"/>Duplicar</button><button className="action-menu-item text-red-700" onClick={onArchive}><Archive className="h-4 w-4"/>Archivar</button></div></details>; }
function PatientDetail({ patient }: { patient: Patient }) { return <div className="space-y-6"><PatientIdentity patient={patient}/><div className="grid gap-3 sm:grid-cols-2">{[["Estado", patient.status], ["Nacimiento", formatDate(patient.birthDate)], ["Teléfono", patient.phone || "—"], ["Correo", patient.email || "—"], ["Ubicación", [patient.city, patient.country].filter(Boolean).join(", ") || "—"], ["Última actividad", formatDate(patient.updatedAt || patient.createdAt)]].map(([label, value]) => <div className="rounded-xl bg-slate-50 p-4 dark:bg-emerald-950" key={label}><small className="text-slate-500">{label}</small><p className="mt-1 font-semibold">{value}</p></div>)}</div><div><h3 className="font-display font-bold">Objetivo actual</h3><p className="mt-2 rounded-xl border p-4 text-sm text-slate-600 dark:border-emerald-800 dark:text-slate-300">{patient.objective || "Aún no se definió un objetivo."}</p></div><div className="flex flex-wrap gap-2"><Link className="primary-button" href={`/pacientes/${patient.id}/atencion`}>Abrir atención integral</Link><Link className="secondary-button" href={`/pacientes/${patient.id}/editar`}>Editar ficha</Link></div></div>; }
function age(value: string) { if (!value) return "Edad no registrada"; const born = new Date(value), now = new Date(); let years = now.getFullYear() - born.getFullYear(); if (now < new Date(now.getFullYear(), born.getMonth(), born.getDate())) years--; return `${Math.max(0, years)} años`; }
function formatDate(value: string) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("es-BO", { dateStyle: "medium" }).format(date); }

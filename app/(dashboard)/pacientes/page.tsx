"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Clock3, Edit3, Plus, Search, Trash2 } from "lucide-react";
import { fullName } from "@/lib/patients";
import { usePatients } from "@/components/patients/patient-provider";
import { ConfirmDialog, EmptyState, ErrorAlert, LoadingState, Pagination, StatusBadge } from "@/components/ui/workspace-ui";

export default function PatientsPage() {
  const { patients, ready, error, remove } = usePatients();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [archiving, setArchiving] = useState<{ id: string; name: string } | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const rows = patients.filter((patient) =>
    [fullName(patient), patient.preferredName, patient.document, patient.email, patient.city]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery) && (status === "all" || patient.status === status),
  );
  const pageSize = 8, pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [query, status]);
  async function archive() { if (!archiving) return; try { setBusy(true); setActionError(""); await remove(archiving.id); setArchiving(null); } catch (e) { setActionError(e instanceof Error ? e.message : "No se pudo archivar."); setArchiving(null); } finally { setBusy(false); } }

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Pacientes</p>
          <h1 className="mt-2 font-display text-3xl font-bold">Mis pacientes</h1>
          <p className="mt-2 text-slate-500">Consulta y administra las fichas administrativas.</p>
        </div>
        <Link
          href="/pacientes/nuevo"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Nuevo paciente
        </Link>
      </div>

      {(error || actionError) && <ErrorAlert message={error || actionError}/>}

      <div className="card mt-6 overflow-hidden">
        <div className="grid gap-3 border-b p-5 dark:border-emerald-800 sm:grid-cols-[1fr_13rem]">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <label htmlFor="patient-search" className="sr-only">Buscar pacientes</label><input id="patient-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, documento, correo o ciudad"
              className="h-11 w-full rounded-xl border bg-transparent pl-11 pr-4"
            />
          </div>
          <label><span className="sr-only">Filtrar pacientes por estado</span><select className="field !mt-0" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos los estados</option><option value="Activo">Activos</option><option value="Inactivo">Inactivos</option></select></label>
        </div>

        {!ready ? <LoadingState label="Cargando pacientes…"/> : rows.length === 0 ? <EmptyState title="No se encontraron pacientes" detail={query || status !== "all" ? "Cambia la búsqueda o el filtro de estado." : "Crea la primera ficha administrativa para comenzar."}/> : <><div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400 dark:bg-emerald-950">
              <tr>
                <th className="p-4">Paciente</th>
                <th>Contacto</th>
                <th>Objetivo</th>
                <th>Ubicación</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((patient) => (
                <tr className="border-t dark:border-emerald-800" key={patient.id}>
                  <td className="p-4">
                    <strong>{fullName(patient)}</strong>
                    <small className="block text-slate-500">
                      {patient.documentType || "Documento"} {patient.document || "—"}
                    </small>
                  </td>
                  <td>
                    {patient.phone || "—"}
                    <small className="block text-slate-500">{patient.email}</small>
                  </td>
                  <td className="max-w-52 truncate">{patient.objective || "Sin definir"}</td>
                  <td>{patient.city || "—"}</td>
                  <td>
                    <StatusBadge value={patient.status}/>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <Link
                        aria-label={`Atención integral de ${fullName(patient)}`}
                        href={"/pacientes/" + patient.id + "/atencion"}
                        className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-emerald-950"
                      >
                        <Activity className="h-4 w-4" />
                      </Link>
                      <Link
                        aria-label={`Historial administrativo de ${fullName(patient)}`}
                        href={"/pacientes/" + patient.id + "/historial"}
                        className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-emerald-950"
                      >
                        <Clock3 className="h-4 w-4" />
                      </Link>
                      <Link
                        aria-label={`Editar ${fullName(patient)}`}
                        title="Editar"
                        href={"/pacientes/" + patient.id + "/editar"}
                        className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-emerald-950"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Link>
                      <button
                        aria-label={`Archivar ${fullName(patient)}`}
                        onClick={() => setArchiving({ id: patient.id, name: fullName(patient) })}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div><Pagination page={page} pages={pages} total={rows.length} onChange={setPage}/></>}
      </div>
      {archiving && <ConfirmDialog title="Archivar paciente" detail={`La ficha de ${archiving.name} dejará de aparecer en la lista activa.`} confirmLabel="Archivar" busy={busy} onCancel={() => setArchiving(null)} onConfirm={() => void archive()}/>}
    </section>
  );
}

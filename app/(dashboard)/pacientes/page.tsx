"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Clock3, Edit3, Plus, Search, Trash2, Users } from "lucide-react";
import { fullName } from "@/lib/patients";
import { usePatients } from "@/components/patients/patient-provider";

export default function PatientsPage() {
  const { patients, ready, error, remove } = usePatients();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const rows = patients.filter((patient) =>
    [fullName(patient), patient.preferredName, patient.document, patient.email, patient.city]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );

  function archive(id: string, name: string) {
    if (confirm("¿Archivar la ficha administrativa de " + name + "?")) {
      void remove(id);
    }
  }

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

      {error && (
        <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="card mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-5 dark:border-emerald-800 sm:flex-row sm:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, documento, correo o ciudad"
              className="h-11 w-full rounded-xl border bg-transparent pl-11 pr-4"
            />
          </div>
          <span className="text-sm text-slate-500">{rows.length} pacientes</span>
        </div>

        <div className="overflow-x-auto">
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
              {ready && rows.map((patient) => (
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
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                      {patient.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <Link
                        title="Atención integral"
                        href={"/pacientes/" + patient.id + "/atencion"}
                        className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-emerald-950"
                      >
                        <Activity className="h-4 w-4" />
                      </Link>
                      <Link
                        title="Historial administrativo"
                        href={"/pacientes/" + patient.id + "/historial"}
                        className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-emerald-950"
                      >
                        <Clock3 className="h-4 w-4" />
                      </Link>
                      <Link
                        title="Editar"
                        href={"/pacientes/" + patient.id + "/editar"}
                        className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-emerald-950"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Link>
                      <button
                        title="Archivar"
                        onClick={() => archive(patient.id, fullName(patient))}
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
          {ready && !rows.length && (
            <div className="grid min-h-64 place-items-center text-center text-slate-400">
              <div>
                <Users className="mx-auto mb-3 h-10 w-10" />
                <p>No se encontraron pacientes.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

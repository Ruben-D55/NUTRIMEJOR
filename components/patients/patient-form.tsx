"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import type { Patient } from "@/lib/patients";
import { usePatients } from "./patient-provider";

const blank = {
  names: "", lastNames: "", preferredName: "", documentType: "CI", document: "",
  birthDate: "", sex: "", phone: "", email: "", address: "", city: "",
  country: "BO", objective: "", status: "Activo" as const,
};

export function PatientForm({ patient }: { patient?: Patient }) {
  const router = useRouter();
  const { add, update } = usePatients();
  const [data, setData] = useState(patient ?? blank);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: string) => setData((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!data.names.trim() || !data.lastNames.trim()) return setError("Nombres y apellidos son obligatorios.");
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return setError("Escribe un correo electrónico válido.");
    if (data.country && !/^[A-Za-z]{2}$/.test(data.country)) return setError("El país debe usar un código ISO de dos letras, por ejemplo BO.");
    if (data.birthDate && new Date(data.birthDate) > new Date()) return setError("La fecha de nacimiento no puede estar en el futuro.");
    try {
      setSaving(true);
      setError("");
      if (patient) await update(patient.id, data);
      else await add(data);
      router.push("/pacientes");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  const fields = [
    ["names", "Nombres", "text"], ["lastNames", "Apellidos", "text"],
    ["preferredName", "Nombre preferido", "text"], ["document", "Documento", "text"],
    ["birthDate", "Fecha de nacimiento", "date"], ["phone", "Teléfono", "tel"],
    ["email", "Correo electrónico", "email"], ["city", "Ciudad", "text"],
    ["address", "Dirección", "text"], ["country", "País (ISO)", "text"],
  ] as const;

  return (
    <form onSubmit={submit} className="card mt-6 p-6 lg:p-8">
      <div className="grid gap-5 md:grid-cols-2">
        {fields.map(([key, label, type]) => (
          <label className="grid gap-2 text-sm font-semibold" key={key}>
            {label}
            <input
              value={String(data[key as keyof typeof data] ?? "")}
              onChange={(event) => set(key, event.target.value)}
              type={type}
              maxLength={key === "country" ? 2 : undefined}
              className="field !mt-0"
              required={key === "names" || key === "lastNames"}
              aria-invalid={!!error && ((key === "names" && !data.names.trim()) || (key === "lastNames" && !data.lastNames.trim()))}
            />
          </label>
        ))}
        <label className="grid gap-2 text-sm font-semibold">
          Tipo de documento
          <select value={data.documentType || ""} onChange={(event) => set("documentType", event.target.value)} className="field !mt-0">
            <option value="">Sin especificar</option><option value="CI">CI</option><option value="PASSPORT">Pasaporte</option><option value="OTHER">Otro</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Sexo
          <select value={data.sex} onChange={(event) => set("sex", event.target.value)} className="field !mt-0">
            <option value="">Seleccionar</option><option>Femenino</option><option>Masculino</option><option>Otro</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Estado
          <select value={data.status} onChange={(event) => set("status", event.target.value)} className="field !mt-0">
            <option>Activo</option><option>Inactivo</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">
          Objetivo general
          <textarea value={data.objective} onChange={(event) => set("objective", event.target.value)} rows={4} className="field py-3" />
        </label>
      </div>
      <p className="mt-4 text-xs text-slate-500">Peso, altura y demás mediciones se registran en el módulo de evaluaciones.</p>
      {error && <p className="field-error mt-4" role="alert">{error}</p>}
      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/pacientes" className="secondary-button"><ArrowLeft className="h-4 w-4" />Cancelar</Link>
        <button disabled={saving} className="primary-button">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Guardando…" : patient ? "Guardar cambios" : "Registrar paciente"}
        </button>
      </div>
    </form>
  );
}

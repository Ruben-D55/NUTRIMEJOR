"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  const initialData = useMemo(() => JSON.stringify(patient ?? blank), [patient]);
  const dirty = JSON.stringify(data) !== initialData;
  const set = (key: string, value: string) => setData((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function cancel(event: React.MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Quieres salir del formulario?")) event.preventDefault();
  }

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

  const field = (key: keyof typeof data, label: string, type = "text", placeholder?: string, required = false) => (
    <label className="grid gap-2 text-sm font-semibold" key={key}>
      <span>{label}{required && <span className="text-red-600" aria-hidden="true"> *</span>}</span>
      <input
        value={String(data[key] ?? "")}
        onChange={(event) => set(key, event.target.value)}
        type={type}
        placeholder={placeholder}
        maxLength={key === "country" ? 2 : undefined}
        className="field !mt-0"
        required={required}
        aria-required={required}
        aria-invalid={!!error && required && !String(data[key] ?? "").trim()}
      />
    </label>
  );

  return (
    <form onSubmit={submit} className="card mt-6 p-6 lg:p-8">
      <p className="text-sm text-slate-500"><span className="text-red-600">*</span> Campos obligatorios</p>
      <fieldset className="mt-5 border-t pt-5 dark:border-emerald-800">
        <legend className="pr-3 font-display text-lg font-bold">Identificación</legend>
        <div className="grid gap-5 md:grid-cols-2">
          {field("names", "Nombres", "text", "Ej. María Fernanda", true)}
          {field("lastNames", "Apellidos", "text", "Ej. López Rojas", true)}
          {field("preferredName", "Nombre preferido", "text", "Cómo desea que le llamen")}
          {field("birthDate", "Fecha de nacimiento", "date")}
          <label className="grid gap-2 text-sm font-semibold">Tipo de documento<select value={data.documentType || ""} onChange={(event) => set("documentType", event.target.value)} className="field !mt-0"><option value="">Sin especificar</option><option value="CI">CI</option><option value="PASSPORT">Pasaporte</option><option value="OTHER">Otro</option></select></label>
          {field("document", "Documento", "text", "Ej. 1234567")}
          <label className="grid gap-2 text-sm font-semibold">Sexo<select value={data.sex} onChange={(event) => set("sex", event.target.value)} className="field !mt-0"><option value="">Seleccionar</option><option>Femenino</option><option>Masculino</option><option>Otro</option></select></label>
          <label className="grid gap-2 text-sm font-semibold">Estado<select value={data.status} onChange={(event) => set("status", event.target.value)} className="field !mt-0"><option>Activo</option><option>Inactivo</option></select></label>
        </div>
      </fieldset>
      <fieldset className="mt-7 border-t pt-5 dark:border-emerald-800">
        <legend className="pr-3 font-display text-lg font-bold">Contacto</legend>
        <div className="grid gap-5 md:grid-cols-2">
          {field("phone", "Teléfono", "tel", "+591 70000000")}
          {field("email", "Correo electrónico", "email", "paciente@correo.com")}
          {field("city", "Ciudad", "text", "La Paz")}
          {field("country", "País (ISO)", "text", "BO")}
          <div className="md:col-span-2">{field("address", "Dirección", "text", "Zona, calle y número")}</div>
        </div>
      </fieldset>
      <fieldset className="mt-7 border-t pt-5 dark:border-emerald-800">
        <legend className="pr-3 font-display text-lg font-bold">Objetivo y seguimiento</legend>
        <label className="grid gap-2 text-sm font-semibold">Objetivo general<textarea value={data.objective} onChange={(event) => set("objective", event.target.value)} placeholder="Describe el propósito principal del acompañamiento" rows={4} className="field py-3" /></label>
      </fieldset>
      <p className="mt-4 text-xs text-slate-500">Peso, altura y demás mediciones se registran en el módulo de evaluaciones.</p>
      {error && <p className="field-error mt-4" role="alert">{error}</p>}
      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/pacientes" className="secondary-button" onClick={cancel}><ArrowLeft className="h-4 w-4" />Cancelar</Link>
        <button disabled={saving} className="primary-button">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Guardando…" : patient ? "Guardar cambios" : "Registrar paciente"}
        </button>
      </div>
    </form>
  );
}

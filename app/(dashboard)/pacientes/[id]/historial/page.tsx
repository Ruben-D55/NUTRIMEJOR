"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarClock, Loader2, Plus } from "lucide-react";
import { fullName, type HistoryItem } from "@/lib/patients";
import { usePatients } from "@/components/patients/patient-provider";

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    location.href = "/api/auth/refresh?next=" + encodeURIComponent(location.pathname);
    throw Error("Tu sesión venció. Se intentará renovar.");
  }
  if (!response.ok) throw Error(data.error || "No se pudo completar la operación.");
  return data;
}

export default function PatientAdministrativeHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const { patients, ready } = usePatients();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState("administrative_note");
  const [notes, setNotes] = useState("");
  const patient = patients.find((item) => item.id === id);

  async function load() {
    try {
      setLoading(true);
      setError("");
      setHistory(await request("/api/patients/" + id + "/history"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error al cargar el historial.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!notes.trim()) return;
    try {
      setSaving(true);
      setError("");
      await request("/api/patients/" + id + "/history", {
        method: "POST",
        body: JSON.stringify({ type, notes }),
      });
      setNotes("");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error al guardar la anotación.");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return <p>Cargando…</p>;
  if (!patient) return <div className="card p-8">Paciente no encontrado.</div>;

  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
        Historial administrativo
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold">{fullName(patient)}</h1>
      <p className="mt-2 text-slate-500">
        Cambios de ficha, asignaciones, consentimientos y observaciones administrativas.
      </p>

      <div className="mt-6 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <form onSubmit={submit} className="card h-fit p-6">
          <h2 className="font-display text-lg font-bold">Nueva anotación administrativa</h2>
          <label className="mt-5 grid gap-2 text-sm font-semibold">
            Tipo
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="h-11 rounded-xl border bg-transparent px-3"
            >
              <option value="administrative_note">Observación administrativa</option>
              <option value="contact_verified">Contacto verificado</option>
              <option value="documentation_received">Documentación recibida</option>
              <option value="consent_reviewed">Consentimiento revisado</option>
              <option value="assignment_note">Nota de asignación</option>
            </select>
          </label>
          <label className="mt-4 grid gap-2 text-sm font-semibold">
            Notas
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={5}
              className="rounded-xl border bg-transparent p-3"
              required
            />
          </label>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button
            disabled={saving}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? "Guardando…" : "Agregar al historial"}
          </button>
        </form>

        <div className="card p-6">
          <h2 className="font-display text-lg font-bold">Línea de tiempo administrativa</h2>
          {loading ? (
            <p className="mt-6 text-slate-500">Cargando historial…</p>
          ) : (
            <div className="mt-5 space-y-5">
              {history.map((entry) => (
                <article className="relative border-l-2 border-emerald-200 pl-6" key={entry.id}>
                  <span className="absolute -left-3 grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <CalendarClock className="h-3 w-3" />
                  </span>
                  <div className="flex justify-between gap-3">
                    <strong>{entry.type}</strong>
                    <time className="text-xs text-slate-500">
                      {new Date(entry.date).toLocaleDateString("es-BO")}
                    </time>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {entry.notes}
                  </p>
                </article>
              ))}
              {!history.length && <p className="text-sm text-slate-500">Todavía no existen anotaciones.</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

export default function RecuperarPassword() {
  const [step, setStep] = useState<"request" | "confirm" | "done">("request");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email") }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || "No se pudo procesar la solicitud.");
    if (data.resetToken) setToken(data.resetToken);
    setMessage("Si la cuenta existe, recibirás las instrucciones de recuperación.");
    setStep("confirm");
  }

  async function confirmReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: form.get("token"),
        newPassword: form.get("newPassword"),
        confirmation: form.get("confirmation"),
      }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(data.error || "No se pudo cambiar la contraseña.");
    setMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
    setStep("done");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-emerald-50 p-6 dark:bg-emerald-950">
      <section className="w-full max-w-md rounded-3xl border bg-white p-8 shadow-sm dark:border-emerald-800 dark:bg-emerald-900">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">NUTRIMEJOR</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold">Recuperar contraseña</h1>
        {step === "request" && (
          <form className="mt-6" onSubmit={requestReset}>
            <label className="block text-sm font-semibold">Correo electrónico</label>
            <input name="email" type="email" required className="mt-2 h-12 w-full rounded-xl border bg-transparent px-4" />
            <button disabled={busy} className="mt-6 h-12 w-full rounded-xl bg-emerald-700 font-semibold text-white">
              {busy ? "Procesando…" : "Solicitar recuperación"}
            </button>
          </form>
        )}
        {step === "confirm" && (
          <form className="mt-6 space-y-4" onSubmit={confirmReset}>
            <label className="block text-sm font-semibold">Código de recuperación</label>
            <input name="token" value={token} onChange={(event) => setToken(event.target.value)} required minLength={64} maxLength={64} className="h-12 w-full rounded-xl border bg-transparent px-4 font-mono text-xs" />
            <label className="block text-sm font-semibold">Nueva contraseña</label>
            <input name="newPassword" type="password" required minLength={8} className="h-12 w-full rounded-xl border bg-transparent px-4" />
            <label className="block text-sm font-semibold">Confirmar contraseña</label>
            <input name="confirmation" type="password" required minLength={8} className="h-12 w-full rounded-xl border bg-transparent px-4" />
            <button disabled={busy} className="h-12 w-full rounded-xl bg-emerald-700 font-semibold text-white">
              {busy ? "Procesando…" : "Cambiar contraseña"}
            </button>
          </form>
        )}
        {message && <p className="mt-5 text-sm text-slate-600 dark:text-emerald-100">{message}</p>}
        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-emerald-700">Volver a iniciar sesión</Link>
      </section>
    </main>
  );
}

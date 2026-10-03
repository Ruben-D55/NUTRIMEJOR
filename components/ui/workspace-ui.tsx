"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from "lucide-react";

export function LoadingState({ label = "Cargando información…" }: { label?: string }) {
  return <div className="card mt-6 grid min-h-56 place-items-center" role="status" aria-live="polite">
    <div className="text-center text-slate-500"><Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin" aria-hidden="true"/><p>{label}</p></div>
  </div>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="grid min-h-56 place-items-center p-8 text-center text-slate-500">
    <div><Inbox className="mx-auto mb-3 h-10 w-10 text-emerald-600" aria-hidden="true"/><h3 className="font-semibold text-slate-700 dark:text-slate-100">{title}</h3><p className="mt-1 max-w-sm text-sm">{detail}</p></div>
  </div>;
}

export function ErrorAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100" role="alert">
    <span className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/>{message}</span>
    {onRetry && <button className="font-semibold underline" onClick={onRetry}>Reintentar</button>}
  </div>;
}

export function Pagination({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (page: number) => void }) {
  if (pages <= 1) return <p className="px-5 py-4 text-sm text-slate-500">{total} registro{total === 1 ? "" : "s"}</p>;
  return <nav className="flex flex-col gap-3 border-t px-5 py-4 dark:border-emerald-800 sm:flex-row sm:items-center sm:justify-between" aria-label="Paginación">
    <p className="text-sm text-slate-500">Página {page} de {pages} · {total} registros</p>
    <div className="flex gap-2">
      <button className="icon-button" aria-label="Página anterior" disabled={page === 1} onClick={() => onChange(page - 1)}><ChevronLeft className="h-4 w-4"/></button>
      <button className="icon-button" aria-label="Página siguiente" disabled={page === pages} onClick={() => onChange(page + 1)}><ChevronRight className="h-4 w-4"/></button>
    </div>
  </nav>;
}

export function Modal({ title, description, children, onClose }: { title: string; description?: string; children: React.ReactNode; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [onClose]);
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-emerald-950/70 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby={description ? "dialog-description" : undefined}>
      <header className="flex items-start justify-between gap-4"><div><h2 id="dialog-title" className="font-display text-xl font-bold">{title}</h2>{description && <p id="dialog-description" className="mt-1 text-sm text-slate-500">{description}</p>}</div><button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Cerrar ventana"><X className="h-5 w-5"/></button></header>
      {children}
    </section>
  </div>;
}

export function ConfirmDialog({ title, detail, confirmLabel = "Confirmar", busy, onConfirm, onCancel }: { title: string; detail: string; confirmLabel?: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return <Modal title={title} description={detail} onClose={onCancel}><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="secondary-button" onClick={onCancel} disabled={busy}>Cancelar</button><button className="danger-button" onClick={onConfirm} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin"/>}{confirmLabel}</button></div></Modal>;
}

export function StatusBadge({ value }: { value: unknown }) {
  const status = String(value || "Sin estado");
  const positive = ["active", "Activo", "completed", "published", "confirmed", "sent", "ready", "trialing"].includes(status);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${positive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"}`}>{status.replaceAll("_", " ")}</span>;
}

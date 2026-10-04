"use client";

import { useEffect, useRef } from "react";
import { Columns3, Download, Search, SlidersHorizontal, X } from "lucide-react";

export function CrudPageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="crud-hero">
    <div className="relative z-10 max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700 dark:text-emerald-300">{eyebrow}</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
    </div>
    {action && <div className="relative z-10 flex shrink-0 flex-wrap gap-2">{action}</div>}
  </header>;
}

export type Metric = { label: string; value: string | number; detail?: string; tone?: "green" | "blue" | "amber" | "slate" };
export function MetricCards({ metrics }: { metrics: Metric[] }) {
  const tones = { green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", blue: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200", amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100", slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" };
  return <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen">
    {metrics.map((metric) => <article className="card metric-card p-4 sm:p-5" key={metric.label}>
      <div className={`mb-3 h-1.5 w-10 rounded-full ${tones[metric.tone || "green"]}`}/>
      <strong className="font-display text-2xl font-extrabold sm:text-3xl">{metric.value}</strong>
      <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{metric.label}</p>
      {metric.detail && <small className="mt-1 block text-slate-500">{metric.detail}</small>}
    </article>)}
  </section>;
}

export function DataToolbar({ searchLabel, searchValue, onSearch, children, trailing }: { searchLabel: string; searchValue: string; onSearch: (value: string) => void; children?: React.ReactNode; trailing?: React.ReactNode }) {
  return <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-emerald-800 lg:flex-row lg:items-center lg:justify-between sm:p-5">
    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row">
      <label className="relative block min-w-0 flex-1 lg:max-w-xl">
        <span className="sr-only">{searchLabel}</span>
        <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" aria-hidden="true"/>
        <input className="field !mt-0 pl-11" value={searchValue} onChange={(event) => onSearch(event.target.value)} placeholder={searchLabel}/>
      </label>
      {children}
    </div>
    {trailing && <div className="flex flex-wrap items-center gap-2">{trailing}</div>}
  </div>;
}

export function PageSizeSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <label className="inline-flex items-center gap-2 text-sm text-slate-500"><span>Mostrar</span><select aria-label="Registros por página" className="h-11 rounded-xl border border-slate-300 bg-white px-3 dark:border-emerald-700 dark:bg-emerald-950" value={value} onChange={(event) => onChange(Number(event.target.value))}>{[10, 25, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label>;
}

export function ColumnChooser({ columns, visible, onToggle }: { columns: Array<{ key: string; label: string }>; visible: string[]; onToggle: (key: string) => void }) {
  return <details className="relative">
    <summary className="secondary-button cursor-pointer list-none"><Columns3 className="h-4 w-4"/>Columnas</summary>
    <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border bg-white p-3 shadow-xl dark:border-emerald-700 dark:bg-emerald-900">
      {columns.map((column) => <label className="flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm hover:bg-slate-50 dark:hover:bg-emerald-800" key={column.key}><input type="checkbox" checked={visible.includes(column.key)} onChange={() => onToggle(column.key)}/>{column.label}</label>)}
    </div>
  </details>;
}

export function ExportButton({ filename, rows }: { filename: string; rows: Array<Record<string, unknown>> }) {
  function download() {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [headers.map(escape).join(","), ...rows.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  }
  return <button type="button" className="secondary-button" onClick={download} disabled={!rows.length}><Download className="h-4 w-4"/>CSV</button>;
}

export function FilterChip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={`filter-chip ${active ? "filter-chip-active" : ""}`} onClick={onClick}>{children}</button>;
}

export function BulkActionBar({ count, children, onClear }: { count: number; children: React.ReactNode; onClear: () => void }) {
  if (!count) return null;
  return <div className="sticky bottom-4 z-20 mx-4 mb-4 flex flex-col gap-3 rounded-2xl bg-emerald-950 px-4 py-3 text-white shadow-2xl sm:flex-row sm:items-center sm:justify-between" role="status"><p className="text-sm font-semibold">{count} seleccionado{count === 1 ? "" : "s"}</p><div className="flex flex-wrap gap-2">{children}<button className="rounded-lg px-3 py-2 text-sm hover:bg-white/10" onClick={onClear}>Cancelar selección</button></div></div>;
}

export function Drawer({ title, description, dirty = false, children, onClose }: { title: string; description?: string; dirty?: boolean; children: React.ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const dirtyRef = useRef(dirty);
  const onCloseRef = useRef(onClose);
  dirtyRef.current = dirty;
  onCloseRef.current = onClose;
  const close = () => { if (!dirtyRef.current || window.confirm("Hay cambios sin guardar. ¿Quieres cerrar el formulario?")) onCloseRef.current(); };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const listener = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", listener); panel.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { document.removeEventListener("keydown", listener); previous?.focus(); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  return <div className="fixed inset-0 z-50 bg-emerald-950/60 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panel} className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title" aria-describedby={description ? "drawer-description" : undefined}>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white/95 p-5 backdrop-blur dark:border-emerald-800 dark:bg-emerald-900/95 sm:p-6"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Formulario</p><h2 id="drawer-title" className="mt-1 font-display text-2xl font-bold">{title}</h2>{description && <p id="drawer-description" className="mt-1 text-sm text-slate-500">{description}</p>}</div><button type="button" className="icon-button" onClick={close} aria-label="Cerrar panel"><X className="h-5 w-5"/></button></header>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  </div>;
}

export function FilterLabel({ children }: { children: React.ReactNode }) { return <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><SlidersHorizontal className="h-3.5 w-3.5"/>{children}</span>; }

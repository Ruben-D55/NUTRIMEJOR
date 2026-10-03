"use client";

type Point = { date: string; value: number };
type Series = { label: string; color: string; points: Point[] };

export function EvolutionChart({ title, unit, series }: { title: string; unit: string; series: Series[] }) {
  const all = series.flatMap((item) => item.points);
  if (!all.length) return <section className="card grid min-h-64 place-items-center p-6 text-center"><div><h2 className="font-display text-lg font-bold">{title}</h2><p className="mt-2 text-sm text-slate-500">Registra mediciones para visualizar la evolución.</p></div></section>;
  const values = all.map((point) => point.value), min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const dates = [...new Set(all.map((point) => point.date))].sort(), width = 720, height = 250, left = 54, right = 18, top = 28, bottom = 42;
  const x = (date: string) => left + (dates.length === 1 ? (width - left - right) / 2 : (dates.indexOf(date) / (dates.length - 1)) * (width - left - right));
  const y = (value: number) => top + (1 - (value - min) / range) * (height - top - bottom);
  return <figure className="card overflow-hidden p-5" aria-labelledby={`chart-${title.replaceAll(" ", "-")}`}>
    <figcaption id={`chart-${title.replaceAll(" ", "-")}`} className="font-display text-lg font-bold">{title}</figcaption>
    <div className="mt-2 flex flex-wrap gap-4 text-xs">{series.map((item) => <span key={item.label} className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }}/>{item.label}</span>)}</div>
    <svg className="mt-4 h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${all.length} mediciones en ${unit}`}>
      {[0, .25, .5, .75, 1].map((step) => { const value = max - range * step, py = top + (height - top - bottom) * step; return <g key={step}><line x1={left} x2={width-right} y1={py} y2={py} stroke="currentColor" opacity=".12"/><text x={left-8} y={py+4} textAnchor="end" fontSize="11" fill="currentColor" opacity=".65">{value.toFixed(range < 5 ? 1 : 0)}</text></g>; })}
      {dates.map((date, index) => (index === 0 || index === dates.length - 1 || dates.length < 5) && <text key={date} x={x(date)} y={height-12} textAnchor={index === 0 ? "start" : index === dates.length - 1 ? "end" : "middle"} fontSize="11" fill="currentColor" opacity=".65">{new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "short" }).format(new Date(date))}</text>)}
      {series.map((item) => { const sorted = [...item.points].sort((a,b) => a.date.localeCompare(b.date)); return <g key={item.label}><polyline fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={sorted.map((point) => `${x(point.date)},${y(point.value)}`).join(" ")}/>{sorted.map((point) => <circle key={point.date} cx={x(point.date)} cy={y(point.value)} r="5" fill={item.color}><title>{item.label}: {point.value} {unit}</title></circle>)}</g>; })}
    </svg>
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-emerald-700">Ver datos de la gráfica</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="py-2">Fecha</th><th>Indicador</th><th>Valor</th></tr></thead><tbody>{series.flatMap((item) => item.points.map((point) => <tr className="border-t dark:border-emerald-800" key={`${item.label}-${point.date}`}><td className="py-2">{new Date(point.date).toLocaleDateString("es-BO")}</td><td>{item.label}</td><td>{point.value} {unit}</td></tr>))}</tbody></table></div></details>
  </figure>;
}

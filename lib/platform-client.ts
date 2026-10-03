export type PlatformRecord = Record<string, unknown> & { id: string };

export async function platformRequest<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...options?.headers },
    ...options,
  });
  if (response.status === 204) return null as T;
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.href = `/api/auth/refresh?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Tu sesión venció. Se intentará renovar.");
  }
  if (!response.ok) {
    const payload = data as Record<string, unknown>;
    throw new Error(String(payload.error || payload.message || "No se pudo completar la operación."));
  }
  return data as T;
}

export function recordList(value: unknown): PlatformRecord[] {
  if (Array.isArray(value)) return value as PlatformRecord[];
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  for (const key of ["items", "data", "results", "records", "appointments", "documents", "snapshots", "jobs"]) {
    if (Array.isArray(object[key])) return object[key] as PlatformRecord[];
  }
  return [];
}

export function dateInput(value?: unknown) {
  const date = value ? new Date(String(value)) : new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function displayDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

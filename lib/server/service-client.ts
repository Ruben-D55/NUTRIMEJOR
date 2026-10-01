import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export type ServiceName =
  | "identity"
  | "patients"
  | "catalogs"
  | "subscriptions"
  | "clinical"
  | "measurements"
  | "nutrition"
  | "planning"
  | "scheduling"
  | "notifications"
  | "documents"
  | "reporting";

const serviceUrls: Record<ServiceName, string> = {
  identity: process.env.IDENTITY_API_URL || "http://localhost:4001",
  patients: process.env.PATIENTS_API_URL || "http://localhost:4002",
  catalogs: process.env.CATALOGS_API_URL || "http://localhost:4003",
  subscriptions: process.env.SUBSCRIPTIONS_API_URL || "http://localhost:4004",
  clinical: process.env.CLINICAL_API_URL || "http://localhost:4005",
  measurements: process.env.MEASUREMENTS_API_URL || "http://localhost:4006",
  nutrition: process.env.NUTRITION_API_URL || "http://localhost:4007",
  planning: process.env.PLANNING_API_URL || "http://localhost:4008",
  scheduling: process.env.SCHEDULING_API_URL || "http://localhost:4009",
  notifications: process.env.NOTIFICATIONS_API_URL || "http://localhost:4010",
  documents: process.env.DOCUMENTS_API_URL || "http://localhost:4011",
  reporting: process.env.REPORTING_API_URL || "http://localhost:4012",
};

function requestId(request?: Request) {
  return request?.headers.get("x-request-id") || crypto.randomUUID();
}

export async function callService(
  service: ServiceName,
  path: string,
  options: RequestInit = {},
  request?: Request,
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("nm_session")?.value;
  const headers = new Headers(options.headers);
  headers.set("accept", "application/json");
  headers.set("x-request-id", requestId(request));
  headers.set("x-service-key", process.env.SERVICE_API_KEY || "development-only-key");
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (options.body) headers.set("content-type", "application/json");

  let response = await fetch(`${serviceUrls[service]}${path}`, {
    ...options,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(Number(process.env.SERVICE_TIMEOUT_MS || 5000)),
  });
  if (request && token && response.status === 401 && !path.startsWith("/v1/sessions/")) {
    const renewed = await renewSession(request);
    if (renewed) {
      headers.set("authorization", `Bearer ${renewed.accessToken}`);
      response = await fetch(`${serviceUrls[service]}${path}`, {
        ...options,
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(Number(process.env.SERVICE_TIMEOUT_MS || 5000)),
      });
    }
  }
  return response;
}

export async function renewSession(request?: Request) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("nm_refresh")?.value;
  if (!refreshToken) return null;
  const response = await fetch(`${serviceUrls.identity}/v1/sessions/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-service-key": process.env.SERVICE_API_KEY || "development-only-key",
      "x-request-id": requestId(request),
    },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(Number(process.env.SERVICE_TIMEOUT_MS || 5000)),
  });
  if (!response.ok) return null;
  const data = await response.json();
  cookieStore.set("nm_session", data.accessToken, sessionCookie);
  cookieStore.set("nm_refresh", data.refreshToken, refreshCookie);
  return data;
}

export async function proxyService(
  service: ServiceName,
  path: string,
  request: Request,
) {
  try {
    const method = request.method;
    const body = method === "GET" || method === "HEAD" ? undefined : await request.text();
    const response = await callService(service, path, { method, body }, request);
    const text = response.status === 204 ? null : await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: text
        ? { "content-type": response.headers.get("content-type") || "application/json" }
        : undefined,
    });
  } catch (error) {
    console.error(`Error comunicando con ${service}:`, error);
    return NextResponse.json(
      { error: "El servicio no está disponible temporalmente." },
      { status: 503 },
    );
  }
}

export const sessionCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 1800,
  path: "/",
};

export const refreshCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 2592000,
  path: "/",
};

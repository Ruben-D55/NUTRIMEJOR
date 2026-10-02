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

const gatewayUrl = process.env.GATEWAY_API_URL || "http://localhost:4080";
const prefixedResources = new Set<ServiceName>(["patients", "catalogs"]);

function route(service: ServiceName, upstreamPath: string) {
  const url = new URL(upstreamPath, "http://gateway.local");
  let path = url.pathname.replace(/^\/v1/, "") || "/";
  if (prefixedResources.has(service) && (path === `/${service}` || path.startsWith(`/${service}/`))) {
    path = path.slice(service.length + 1) || "";
  }
  return `/api/v1/${service}${path}${url.search}`;
}

function requestId(request?: Request) {
  return request?.headers.get("x-correlation-id")
    || request?.headers.get("x-request-id")
    || crypto.randomUUID();
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
  const method = options.method || "GET";
  headers.set("accept", "application/json");
  headers.set("x-correlation-id", requestId(request));
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (options.body) headers.set("content-type", "application/json");

  let response = await fetch(`${gatewayUrl}${route(service, path)}`, {
    ...options,
    method,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(Number(process.env.GATEWAY_TIMEOUT_MS || 5000) + 1000),
  });
  if (request && token && response.status === 401 && !path.startsWith("/v1/sessions/")) {
    const renewed = await renewSession(request);
    if (renewed) {
      headers.set("authorization", `Bearer ${renewed.accessToken}`);
      response = await fetch(`${gatewayUrl}${route(service, path)}`, {
        ...options,
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(Number(process.env.GATEWAY_TIMEOUT_MS || 5000) + 1000),
      });
    }
  }
  return response;
}

export async function renewSession(request?: Request) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("nm_refresh")?.value;
  if (!refreshToken) return null;
  const path = "/v1/sessions/refresh";
  const headers = new Headers({ "content-type": "application/json", "x-correlation-id": requestId(request) });
  const response = await fetch(`${gatewayUrl}${route("identity", path)}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(Number(process.env.GATEWAY_TIMEOUT_MS || 5000) + 1000),
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
      headers: {
        ...(text ? { "content-type": response.headers.get("content-type") || "application/json" } : {}),
        "x-correlation-id": response.headers.get("x-correlation-id") || requestId(request),
      },
    });
  } catch (error) {
    console.error(`Error comunicando con ${service}:`, error);
    return NextResponse.json(
      { error: "El servicio no está disponible temporalmente." },
      { status: 503 },
    );
  }
}

const accessTokenMinutes = Math.min(30, Math.max(5, Number(process.env.ACCESS_TOKEN_MINUTES || 10)));
const refreshTokenDays = Math.min(30, Math.max(1, Number(process.env.REFRESH_TOKEN_DAYS || 7)));

export const sessionCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: accessTokenMinutes * 60,
  path: "/",
};

export const refreshCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: refreshTokenDays * 24 * 60 * 60,
  path: "/",
};

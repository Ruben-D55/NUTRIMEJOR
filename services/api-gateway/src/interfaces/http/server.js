import http from "node:http";
import { randomUUID } from "node:crypto";
import { authorize } from "../../application/authorization.js";
import { resolveRoute } from "../../application/route-resolver.js";
import { signedHeaders } from "../../infrastructure/security/service-auth.js";
import { MetricsRegistry } from "../../infrastructure/observability/metrics.js";
import { Telemetry } from "../../infrastructure/observability/telemetry.js";

const retryStatuses = new Set([502, 503, 504]);
const publicIdentityRoutes = new Set([
  "POST /v1/users",
  "POST /v1/sessions",
  "POST /v1/sessions/refresh",
  "POST /v1/sessions/logout",
  "POST /v1/password-resets",
  "POST /v1/password-resets/confirm",
]);

function correlationId(request) {
  const supplied = String(request.headers["x-correlation-id"] || request.headers["x-request-id"] || "");
  return /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : randomUUID();
}

function clientIp(request) {
  return String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown")
    .split(",")[0].trim();
}

function isPublic(route, method) {
  const path = new URL(route.upstreamPath, "http://internal").pathname;
  return (method === "GET" && path === "/health/ready")
    || (route.service === "identity" && publicIdentityRoutes.has(`${method} ${path}`))
    || (route.service === "documents" && method === "GET" && path.startsWith("/v1/download/"));
}

function cors(request, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) return { allowed: true, headers: {} };
  if (!allowedOrigins.has(origin)) return { allowed: false, headers: {} };
  return {
    allowed: true,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type,x-correlation-id",
      vary: "Origin",
    },
  };
}

function send(response, status, body, id, extraHeaders = {}) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "x-correlation-id": id,
    "x-request-id": id,
    "x-content-type-options": "nosniff",
    ...extraHeaders,
  };
  response.writeHead(status, headers);
  response.end(body === undefined ? "" : JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw Object.assign(new Error("PAYLOAD_TOO_LARGE"), { status: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function forward(request, route, body, id, config, breaker, telemetry, metrics, parentSpan) {
  if (!breaker.canRequest(route.service)) {
    metrics.recordCircuitOpen(route.service);
    return { gatewayError: 503, code: "CIRCUIT_OPEN", message: "El servicio está temporalmente aislado." };
  }
  const method = request.method || "GET";
  const maxAttempts = ["GET", "HEAD"].includes(method) ? config.retries + 1 : 1;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const span = telemetry.child(`HTTP ${method} ${route.service}`, parentSpan, {
      "server.address": route.service,
      "http.request.method": method,
      "http.route": route.upstreamPath.split("?")[0],
      "retry.attempt": attempt,
    });
    const headers = new Headers({
      accept: request.headers.accept || "application/json",
      "x-correlation-id": id,
      "x-request-id": id,
      "x-forwarded-for": clientIp(request),
      ...signedHeaders(config.serviceKey, method, route.upstreamPath),
      traceparent: telemetry.traceparent(span),
    });
    if (request.headers.authorization) headers.set("authorization", request.headers.authorization);
    if (request.headers["content-type"]) headers.set("content-type", request.headers["content-type"]);
    try {
      const upstream = await fetch(`${config.serviceUrls[route.service]}${route.upstreamPath}`, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      telemetry.endSpan(span, upstream.status, { "http.response.status_code": upstream.status });
      if (retryStatuses.has(upstream.status) && attempt < maxAttempts) {
        metrics.recordUpstreamFailure(route.service, `http_${upstream.status}`);
        await upstream.arrayBuffer();
        await wait(50 * attempt);
        continue;
      }
      if (upstream.status >= 500) breaker.failure(route.service);
      else breaker.success(route.service);
      return { upstream, attempts: attempt };
    } catch (error) {
      telemetry.endSpan(span, 503, { "error.type": error?.name || "Error" });
      lastError = error;
      metrics.recordUpstreamFailure(route.service, error?.name === "TimeoutError" ? "timeout" : "network");
      if (attempt < maxAttempts) {
        await wait(50 * attempt);
        continue;
      }
    }
  }
  breaker.failure(route.service);
  const timeout = lastError?.name === "TimeoutError" || lastError?.name === "AbortError";
  return {
    gatewayError: timeout ? 504 : 502,
    code: timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
    message: timeout ? "El servicio agotó el tiempo de respuesta." : "El servicio no está disponible.",
  };
}

async function readiness(config) {
  const checks = await Promise.allSettled(Object.values(config.serviceUrls).map((baseUrl) =>
    fetch(`${baseUrl}/health/ready`, { signal: AbortSignal.timeout(2000) }).then((response) => {
      if (!response.ok) throw new Error(String(response.status));
    })));
  return checks.filter((result) => result.status === "fulfilled").length;
}

export function createServer(config, verifier, limiter, breaker, observability = {}) {
  const metrics = observability.metrics || new MetricsRegistry();
  const telemetry = observability.telemetry || new Telemetry();
  return http.createServer(async (request, response) => {
    const startedAt = Date.now();
    const id = correlationId(request);
    const method = request.method || "GET";
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const rootSpan = telemetry.startSpan(`${method} ${url.pathname}`, request.headers.traceparent, {
      "http.request.method": method,
      "url.path": url.pathname,
    });
    const corsPolicy = cors(request, config.allowedOrigins);
    let service = "gateway";
    let attempts = 0;
    try {
      if (!corsPolicy.allowed) return send(response, 403, { error: "Origen no permitido.", code: "CORS_DENIED" }, id);
      if (method === "OPTIONS") return send(response, 204, undefined, id, corsPolicy.headers);
      if (method === "GET" && ["/health", "/health/live"].includes(url.pathname)) {
        return send(response, 200, { status: "ok", service: "api-gateway" }, id, corsPolicy.headers);
      }
      if (method === "GET" && url.pathname === "/metrics") {
        response.writeHead(200, {
          "content-type": "text/plain; version=0.0.4; charset=utf-8",
          "x-correlation-id": id,
          traceparent: telemetry.traceparent(rootSpan),
        });
        return response.end(metrics.render());
      }
      if (method === "GET" && url.pathname === "/health/ready") {
        const ready = await readiness(config);
        return send(response, ready === 12 ? 200 : 503, { status: ready === 12 ? "ready" : "degraded", ready, total: 12 }, id, corsPolicy.headers);
      }
      const route = resolveRoute(url.pathname, url.search);
      if (!route) return send(response, 404, { error: "Ruta de gateway no encontrada.", code: "ROUTE_NOT_FOUND" }, id, corsPolicy.headers);
      service = route.service;
      const publicRequest = isPublic(route, method);
      const sensitive = publicRequest && route.service === "identity";
      const ipLimit = limiter.check(clientIp(request), null, sensitive);
      if (!ipLimit.allowed) {
        return send(response, 429, { error: "Demasiadas solicitudes.", code: "RATE_LIMITED" }, id,
          { ...corsPolicy.headers, "retry-after": String(ipLimit.retryAfter) });
      }
      const body = ["GET", "HEAD"].includes(method) ? undefined : await readBody(request);
      let actor = null;
      if (!publicRequest) {
        try {
          actor = await verifier.verify(request.headers.authorization);
        } catch {
          return send(response, 401, { error: "Sesión inválida o vencida.", code: "UNAUTHORIZED" }, id, corsPolicy.headers);
        }
        const userLimit = limiter.consume(`user:${actor.id}`, 300, 60000);
        if (!userLimit.allowed) {
          return send(response, 429, { error: "Demasiadas solicitudes.", code: "RATE_LIMITED" }, id,
            { ...corsPolicy.headers, "retry-after": String(userLimit.retryAfter) });
        }
        const upstreamUrl = new URL(route.upstreamPath, "http://internal");
        let authorizationBody = null;
        if (body && String(request.headers["content-type"] || "").includes("application/json")) {
          try { authorizationBody = JSON.parse(body.toString("utf8")); } catch { authorizationBody = null; }
        }
        if (!authorize(actor, route.service, method, upstreamUrl, authorizationBody)) {
          return send(response, 403, { error: "No tienes permisos para esta operación.", code: "FORBIDDEN" }, id, corsPolicy.headers);
        }
      }
      const result = await forward(request, route, body, id, config, breaker, telemetry, metrics, rootSpan);
      if (result.gatewayError) {
        return send(response, result.gatewayError, { error: result.message, code: result.code }, id, corsPolicy.headers);
      }
      attempts = result.attempts;
      const bytes = Buffer.from(await result.upstream.arrayBuffer());
      const headers = {
        ...corsPolicy.headers,
        "x-correlation-id": id,
        "x-request-id": id,
        "x-gateway-attempts": String(result.attempts),
        "x-content-type-options": "nosniff",
        traceparent: telemetry.traceparent(rootSpan),
      };
      for (const name of ["content-type", "content-disposition", "x-content-sha256", "location", "retry-after"]) {
        const value = result.upstream.headers.get(name);
        if (value) headers[name] = value;
      }
      response.writeHead(result.upstream.status, headers);
      return response.end(bytes);
    } catch (error) {
      const status = error.status || 500;
      return send(response, status, {
        error: status === 413 ? "Solicitud demasiado grande." : "Error interno del gateway.",
        code: status === 413 ? "PAYLOAD_TOO_LARGE" : "GATEWAY_ERROR",
      }, id, corsPolicy.headers);
    } finally {
      const durationMs = Date.now() - startedAt;
      if (url.pathname !== "/metrics") metrics.observeRequest(method, service, response.statusCode, durationMs / 1000);
      telemetry.endSpan(rootSpan, response.statusCode, {
        "http.response.status_code": response.statusCode,
        "nutrimejor.service": service,
      });
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: response.statusCode >= 500 ? "error" : "info",
        traceId: rootSpan.traceId,
        correlationId: id,
        method,
        path: url.pathname,
        service,
        status: response.statusCode,
        attempts,
        ms: durationMs,
      }));
    }
  });
}

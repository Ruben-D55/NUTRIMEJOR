import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { DomainError, unauthorized } from "../../domain/errors.js";

function send(response, status, body, requestId) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": requestId,
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 100_000) throw new DomainError("Solicitud demasiado grande.", 413, "PAYLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new DomainError("El cuerpo debe ser JSON válido.", 400, "INVALID_JSON");
  }
}

function equal(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createServer(subscriptions, identity, config, readiness) {
  return http.createServer(async (request, response) => {
    const requestId = request.headers["x-request-id"] || crypto.randomUUID();
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const startedAt = Date.now();
    try {
      if (request.method === "GET" && ["/health", "/health/live"].includes(url.pathname)) {
        return send(response, 200, { status: "ok", service: config.serviceName }, requestId);
      }
      if (request.method === "GET" && url.pathname === "/health/ready") {
        await readiness();
        return send(response, 200, { status: "ready", service: config.serviceName }, requestId);
      }
      if (!equal(request.headers["x-service-key"], config.serviceKey)) {
        throw unauthorized("Cliente de servicio no autorizado.");
      }
      const internal = url.pathname.match(/^\/v1\/internal\/organizations\/([0-9a-f-]+)\/(entitlements|consume)$/i);
      if (internal) {
        const organizationId = internal[1];
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
          throw new DomainError("Organización inválida.", 400, "VALIDATION_ERROR");
        }
        const systemActor = { id: 0, organizationId, organizationRole: "OWNER" };
        if (internal[2] === "entitlements" && request.method === "GET") {
          return send(response, 200, await subscriptions.entitlements(systemActor), requestId);
        }
        if (internal[2] === "consume" && request.method === "POST") {
          return send(response, 200, await subscriptions.consume(systemActor, await readJson(request)), requestId);
        }
      }
      const actor = await identity.authenticate(request.headers.authorization, requestId);

      if (request.method === "GET" && url.pathname === "/v1/plans") {
        return send(response, 200, await subscriptions.listPlans(), requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/subscriptions/current") {
        return send(response, 200, await subscriptions.current(actor), requestId);
      }
      if (request.method === "PUT" && url.pathname === "/v1/subscriptions/current") {
        return send(response, 200, await subscriptions.changePlan(actor, await readJson(request)), requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/entitlements") {
        return send(response, 200, await subscriptions.entitlements(actor), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/subscriptions/current/cancel") {
        return send(response, 200, await subscriptions.cancel(actor, await readJson(request)), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/subscriptions/current/reactivate") {
        return send(response, 200, await subscriptions.reactivate(actor), requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/subscriptions/current/history") {
        return send(response, 200, await subscriptions.history(actor), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/usage/consume") {
        return send(response, 200, await subscriptions.consume(actor, await readJson(request)), requestId);
      }
      return send(response, 404, { error: "Ruta no encontrada.", code: "ROUTE_NOT_FOUND" }, requestId);
    } catch (error) {
      if (error instanceof ZodError) {
        send(response, 400, { error: error.issues[0]?.message || "Datos inválidos.", code: "VALIDATION_ERROR" }, requestId);
      } else if (error instanceof DomainError) {
        send(response, error.status, { error: error.message, code: error.code }, requestId);
      } else {
        console.error(JSON.stringify({ requestId, error: error?.stack || String(error) }));
        send(response, 500, { error: "Error interno del servicio.", code: "INTERNAL_ERROR" }, requestId);
      }
    } finally {
      console.log(JSON.stringify({ requestId, method: request.method, path: url.pathname, ms: Date.now() - startedAt }));
    }
  });
}

import http from "node:http";
import { ZodError } from "zod";
import { DomainError, unauthorized } from "../../domain/errors.js";
import { verifyServiceRequest } from "../../infrastructure/security/service-auth.js";

function send(response, status, body, requestId) {
  const headers = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": requestId,
  };
  if (body !== undefined) headers["content-type"] = "application/json; charset=utf-8";
  response.writeHead(status, headers);
  response.end(body === undefined ? "" : JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new DomainError("Solicitud demasiado grande.", 413, "PAYLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new DomainError("El cuerpo debe ser JSON válido.", 400, "INVALID_JSON");
  }
}


export function createServer(records, identity, config, readiness) {
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
      if (!verifyServiceRequest(request, config.serviceKey)) {
        throw unauthorized("Cliente de servicio no autorizado.");
      }
      const actor = await identity.authenticate(request.headers.authorization, requestId);

      if (url.pathname === "/v1/preferences" && request.method === "POST") {
        return send(response, 200, await records.setPreference(actor, await readJson(request)), requestId);
      }
      const preferences = url.pathname.match(/^\/v1\/preferences\/patients\/([^/]+)$/);
      if (preferences && request.method === "GET") {
        return send(response, 200, await records.preferences(actor, decodeURIComponent(preferences[1])), requestId);
      }
      if (url.pathname === "/v1/notification-jobs" && request.method === "POST") {
        return send(response, 201, await records.createNotification(actor, await readJson(request)), requestId);
      }
      if (url.pathname === "/v1/notification-jobs" && request.method === "GET") {
        return send(response, 200, await records.listNotifications(actor, url.searchParams.get("patientId")), requestId);
      }
      if (url.pathname === "/v1/alert-rules" && request.method === "GET") {
        return send(response, 200, await records.alertRules(actor), requestId);
      }
      if (url.pathname === "/v1/alert-rules" && request.method === "POST") {
        return send(response, 201, await records.createAlertRule(actor, await readJson(request)), requestId);
      }
      const alertRule = url.pathname.match(/^\/v1\/alert-rules\/([^/]+)$/);
      if (alertRule && request.method === "PUT") {
        return send(response, 200, await records.updateAlertRule(
          actor,
          decodeURIComponent(alertRule[1]),
          await readJson(request),
        ), requestId);
      }

      if (url.pathname === config.resourcePath && request.method === "GET") {
        return send(response, 200, await records.list(actor, url.searchParams.get("patientId")), requestId);
      }
      if (url.pathname === config.resourcePath && request.method === "POST") {
        return send(response, 201, await records.create(actor, await readJson(request)), requestId);
      }

      const status = url.pathname.match(new RegExp(`^${config.resourcePath}/([^/]+)/status$`));
      if (status && request.method === "POST") {
        return send(response, 200, await records.changeStatus(actor, decodeURIComponent(status[1]), await readJson(request)), requestId);
      }

      const item = url.pathname.match(new RegExp(`^${config.resourcePath}/([^/]+)$`));
      if (item && request.method === "GET") {
        return send(response, 200, await records.get(actor, decodeURIComponent(item[1])), requestId);
      }
      if (item && request.method === "PUT") {
        return send(response, 200, await records.update(actor, decodeURIComponent(item[1]), await readJson(request)), requestId);
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

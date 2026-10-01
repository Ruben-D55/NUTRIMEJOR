import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { DomainError, unauthorized } from "../../domain/errors.js";

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
    if (size > 1_000_000) throw new DomainError("Solicitud demasiado grande.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new DomainError("El cuerpo debe ser JSON válido.", 400);
  }
}

function equal(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createServer(patients, identity, config, readiness) {
  return http.createServer(async (request, response) => {
    const requestId = request.headers["x-request-id"] || crypto.randomUUID();
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const startedAt = Date.now();
    try {
      if (request.method === "GET" && ["/health", "/health/live"].includes(url.pathname)) {
        return send(response, 200, { status: "ok", service: "patients-api" }, requestId);
      }
      if (request.method === "GET" && url.pathname === "/health/ready") {
        await readiness();
        return send(response, 200, { status: "ready", service: "patients-api" }, requestId);
      }
      if (!equal(request.headers["x-service-key"], config.serviceKey)) {
        throw unauthorized("Cliente de servicio no autorizado.");
      }
      const actor = await identity.authenticate(request.headers.authorization, requestId);

      if (url.pathname === "/v1/patients" && request.method === "GET") {
        return send(response, 200, await patients.list(actor, {
          query: url.searchParams.get("q") || "",
          status: url.searchParams.get("status") || undefined,
          tagId: url.searchParams.get("tagId") || undefined,
          limit: url.searchParams.get("limit") || undefined,
          cursor: url.searchParams.get("cursor") || undefined,
          paged: url.searchParams.has("limit") || url.searchParams.has("cursor"),
        }), requestId);
      }
      if (url.pathname === "/v1/patients" && request.method === "POST") {
        return send(response, 201, await patients.create(actor, await readJson(request)), requestId);
      }

      const history = url.pathname.match(/^\/v1\/patients\/([^/]+)\/history$/);
      if (history && request.method === "GET") {
        return send(response, 200, await patients.history(actor, decodeURIComponent(history[1])), requestId);
      }
      if (history && request.method === "POST") {
        return send(
          response,
          201,
          await patients.addHistory(actor, decodeURIComponent(history[1]), await readJson(request)),
          requestId,
        );
      }

      const patient = url.pathname.match(/^\/v1\/patients\/([^/]+)$/);
      if (patient && request.method === "GET") {
        return send(response, 200, await patients.get(actor, decodeURIComponent(patient[1])), requestId);
      }
      if (patient && request.method === "PUT") {
        return send(
          response,
          200,
          await patients.update(actor, decodeURIComponent(patient[1]), await readJson(request)),
          requestId,
        );
      }
      if (patient && request.method === "DELETE") {
        await patients.remove(actor, decodeURIComponent(patient[1]));
        return send(response, 204, undefined, requestId);
      }

      const nested = url.pathname.match(/^\/v1\/patients\/([^/]+)\/(contacts|emergency-contacts|assignments|tags|consents)$/);
      if (nested && request.method === "GET") {
        const [, id, resource] = nested;
        const methods = {
          contacts: "contacts",
          "emergency-contacts": "emergencyContacts",
          assignments: "assignments",
          tags: "tags",
          consents: "consents",
        };
        return send(response, 200, await patients[methods[resource]](actor, decodeURIComponent(id)), requestId);
      }
      if (nested && request.method === "POST") {
        const [, id, resource] = nested;
        const methods = {
          contacts: "addContact",
          "emergency-contacts": "addEmergencyContact",
          assignments: "assign",
          tags: "addTag",
          consents: "addConsent",
        };
        return send(response, 201, await patients[methods[resource]](
          actor,
          decodeURIComponent(id),
          await readJson(request),
        ), requestId);
      }
      return send(response, 404, { error: "Ruta no encontrada." }, requestId);
    } catch (error) {
      if (error instanceof ZodError) {
        send(response, 400, { error: error.issues[0]?.message || "Datos inválidos." }, requestId);
      } else if (error instanceof DomainError) {
        send(response, error.status, { error: error.message, code: error.code }, requestId);
      } else {
        console.error(JSON.stringify({ requestId, error: error?.stack || String(error) }));
        send(response, 500, { error: "Error interno del servicio." }, requestId);
      }
    } finally {
      console.log(JSON.stringify({ requestId, method: request.method, path: url.pathname, ms: Date.now() - startedAt }));
    }
  });
}

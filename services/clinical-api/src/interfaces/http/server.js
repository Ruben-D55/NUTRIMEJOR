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
    if (size > 1_000_000) throw new DomainError("Solicitud demasiado grande.", 413, "PAYLOAD_TOO_LARGE");
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
      if (!equal(request.headers["x-service-key"], config.serviceKey)) {
        throw unauthorized("Cliente de servicio no autorizado.");
      }
      const actor = await identity.authenticate(request.headers.authorization, requestId);

      const patientResource = url.pathname.match(
        /^\/v1\/patients\/([^/]+)\/(clinical-record|timeline|clinical-entries)$/,
      );
      if (patientResource) {
        const patientId = decodeURIComponent(patientResource[1]);
        const resource = patientResource[2];
        if (resource === "clinical-record" && request.method === "GET") {
          return send(response, 200, await records.clinicalRecord(actor, patientId), requestId);
        }
        if (resource === "timeline" && request.method === "GET") {
          return send(response, 200, await records.timeline(actor, patientId), requestId);
        }
        if (resource === "clinical-entries" && request.method === "GET") {
          return send(
            response,
            200,
            await records.listEntries(actor, patientId, url.searchParams.get("category")),
            requestId,
          );
        }
        if (resource === "clinical-entries" && request.method === "POST") {
          return send(
            response,
            201,
            await records.createEntry(actor, patientId, await readJson(request)),
            requestId,
          );
        }
      }

      const clinicalEntry = url.pathname.match(/^\/v1\/clinical-entries\/([^/]+)$/);
      if (clinicalEntry && request.method === "PUT") {
        return send(
          response,
          200,
          await records.updateEntry(actor, decodeURIComponent(clinicalEntry[1]), await readJson(request)),
          requestId,
        );
      }
      if (clinicalEntry && request.method === "DELETE") {
        await records.archiveEntry(actor, decodeURIComponent(clinicalEntry[1]));
        return send(response, 204, undefined, requestId);
      }

      if (url.pathname === "/v1/migrations/patient-history" && request.method === "POST") {
        return send(response, 200, await records.importLegacyHistory(actor, await readJson(request)), requestId);
      }

      if (url.pathname === config.resourcePath && request.method === "GET") {
        return send(response, 200, await records.list(actor, url.searchParams.get("patientId")), requestId);
      }
      if (url.pathname === config.resourcePath && request.method === "POST") {
        return send(response, 201, await records.create(actor, await readJson(request)), requestId);
      }

      const command = url.pathname.match(
        new RegExp(`^${config.resourcePath}/([^/]+)/(publish|corrections|versions|diagnoses|goals|follow-ups)$`),
      );
      if (command) {
        const id = decodeURIComponent(command[1]);
        const action = command[2];
        if (action === "publish" && request.method === "POST") {
          return send(response, 200, await records.publish(actor, id, await readJson(request)), requestId);
        }
        if (action === "corrections" && request.method === "POST") {
          return send(response, 201, await records.correct(actor, id, await readJson(request)), requestId);
        }
        if (action === "versions" && request.method === "GET") {
          return send(response, 200, await records.versions(actor, id), requestId);
        }
        if (action === "diagnoses" && request.method === "GET") {
          return send(response, 200, await records.listDiagnoses(actor, id), requestId);
        }
        if (action === "diagnoses" && request.method === "POST") {
          return send(response, 201, await records.createDiagnosis(actor, id, await readJson(request)), requestId);
        }
        if (action === "goals" && request.method === "GET") {
          return send(response, 200, await records.listGoals(actor, id), requestId);
        }
        if (action === "goals" && request.method === "POST") {
          return send(response, 201, await records.createGoal(actor, id, await readJson(request)), requestId);
        }
        if (action === "follow-ups" && request.method === "GET") {
          return send(response, 200, await records.listFollowUps(actor, id), requestId);
        }
        if (action === "follow-ups" && request.method === "POST") {
          return send(response, 201, await records.createFollowUp(actor, id, await readJson(request)), requestId);
        }
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

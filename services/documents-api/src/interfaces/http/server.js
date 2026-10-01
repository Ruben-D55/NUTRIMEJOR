import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
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
      const download = url.pathname.match(/^\/v1\/download\/([^/]+)$/);
      if (download && request.method === "GET") {
        const file = await records.resolveToken(decodeURIComponent(download[1]));
        if (!file) return send(response, 404, { error: "Enlace inválido o vencido.", code: "DOWNLOAD_NOT_FOUND" }, requestId);
        const bytes = await readFile(file.storagePath);
        response.writeHead(200, {
          "content-type": file.contentType,
          "content-length": bytes.length,
          "content-disposition": `inline; filename="${String(file.title).replace(/["\\]/g, "")}.pdf"`,
          "x-content-sha256": file.sha256,
          "x-content-type-options": "nosniff",
          "x-request-id": requestId,
        });
        return response.end(bytes);
      }
      if (!equal(request.headers["x-service-key"], config.serviceKey)) {
        throw unauthorized("Cliente de servicio no autorizado.");
      }
      const actor = await identity.authenticate(request.headers.authorization, requestId);

      if (url.pathname === "/v1/templates" && request.method === "POST") {
        return send(response, 201, await records.createTemplate(actor, await readJson(request)), requestId);
      }
      if (url.pathname === "/v1/templates" && request.method === "GET") {
        return send(response, 200, await records.templates(actor, url.searchParams.get("documentType")), requestId);
      }
      if (url.pathname === "/v1/generated-documents" && request.method === "POST") {
        return send(response, 202, await records.generate(actor, await readJson(request)), requestId);
      }
      if (url.pathname === "/v1/generated-documents" && request.method === "GET") {
        return send(response, 200, await records.generatedDocuments(actor, url.searchParams.get("patientId")), requestId);
      }
      const accessUrl = url.pathname.match(/^\/v1\/generated-documents\/([^/]+)\/access-url$/);
      if (accessUrl && request.method === "POST") {
        const baseUrl = `http://${request.headers.host || `localhost:${config.port}`}`;
        return send(response, 200, await records.accessUrl(
          actor,
          decodeURIComponent(accessUrl[1]),
          await readJson(request),
          baseUrl,
        ), requestId);
      }
      const generated = url.pathname.match(/^\/v1\/generated-documents\/([^/]+)$/);
      if (generated && request.method === "GET") {
        return send(response, 200, await records.generatedDocument(actor, decodeURIComponent(generated[1])), requestId);
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

import http from "node:http";
import { ZodError } from "zod";
import { DomainError, unauthorized } from "../../domain/errors.js";
import { verifyServiceRequest } from "../../infrastructure/security/service-auth.js";

function json(response, status, body, requestId) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": requestId,
  });
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


function bearer(request) {
  const value = request.headers.authorization || "";
  if (!value.startsWith("Bearer ")) throw unauthorized();
  return value.slice(7);
}

function auditContext(request, requestId) {
  return {
    requestId,
    ipAddress: String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "")
      .split(",")[0]
      .trim(),
    userAgent: String(request.headers["user-agent"] || "").slice(0, 300),
  };
}

export function createServer(identity, config, readiness) {
  return http.createServer(async (request, response) => {
    const startedAt = Date.now();
    const requestId = request.headers["x-request-id"] || crypto.randomUUID();
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const context = auditContext(request, requestId);

    try {
      if (request.method === "GET" && ["/health", "/health/live"].includes(url.pathname)) {
        return json(response, 200, { status: "ok", service: "identity-api" }, requestId);
      }
      if (request.method === "GET" && url.pathname === "/health/ready") {
        await readiness();
        return json(response, 200, { status: "ready", service: "identity-api" }, requestId);
      }
      if (request.method === "GET" && url.pathname === "/.well-known/jwks.json") {
        return json(response, 200, await identity.jwks(), requestId);
      }
      if (!verifyServiceRequest(request, config.serviceKey)) {
        throw unauthorized("Cliente de servicio no autorizado.");
      }

      if (request.method === "POST" && url.pathname === "/v1/users") {
        return json(response, 201, await identity.register(await readJson(request), context), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/sessions") {
        return json(response, 200, await identity.login(await readJson(request), context), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/sessions/refresh") {
        return json(response, 200, await identity.refresh(await readJson(request), context), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/sessions/logout") {
        return json(response, 200, await identity.logout(await readJson(request), context), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/password-resets") {
        return json(response, 202, await identity.requestPasswordReset(await readJson(request), context), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/password-resets/confirm") {
        return json(response, 200, await identity.resetPassword(await readJson(request), context), requestId);
      }

      const actor = await identity.authenticate(bearer(request));
      if (request.method === "GET" && url.pathname === "/v1/sessions/me") {
        return json(response, 200, { user: actor }, requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/sessions/revoke-all") {
        return json(response, 200, await identity.logoutAll(actor, context), requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/profile") {
        return json(response, 200, await identity.getProfile(actor), requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/organizations") {
        return json(response, 200, await identity.listOrganizations(actor), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/organizations") {
        return json(response, 201, await identity.createOrganization(actor, await readJson(request)), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/sessions/organization") {
        return json(response, 200, await identity.switchOrganization(actor, await readJson(request), context), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/invitations/accept") {
        return json(response, 200, await identity.acceptInvitation(actor, await readJson(request)), requestId);
      }
      const members = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/members$/);
      if (members && request.method === "GET") {
        return json(response, 200, await identity.listMembers(actor, decodeURIComponent(members[1])), requestId);
      }
      const invitations = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/invitations$/);
      if (invitations && request.method === "POST") {
        return json(
          response,
          201,
          await identity.invite(actor, decodeURIComponent(invitations[1]), await readJson(request)),
          requestId,
        );
      }
      if (request.method === "PUT" && url.pathname === "/v1/profile") {
        return json(response, 200, await identity.updateProfile(actor, await readJson(request)), requestId);
      }
      if (request.method === "PATCH" && url.pathname === "/v1/profile/password") {
        return json(response, 200, await identity.changePassword(actor, await readJson(request), context), requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/audit/access") {
        return json(response, 200, await identity.listAccessAudit(actor, url.searchParams.get("limit")), requestId);
      }
      return json(response, 404, { error: "Ruta no encontrada." }, requestId);
    } catch (error) {
      if (error instanceof ZodError) {
        json(response, 400, { error: error.issues[0]?.message || "Datos inválidos." }, requestId);
      } else if (error instanceof DomainError) {
        json(response, error.status, { error: error.message, code: error.code }, requestId);
      } else {
        console.error(JSON.stringify({ requestId, error: error?.stack || String(error) }));
        json(response, 500, { error: "Error interno del servicio." }, requestId);
      }
    } finally {
      console.log(JSON.stringify({ requestId, method: request.method, path: url.pathname, ms: Date.now() - startedAt }));
    }
  });
}

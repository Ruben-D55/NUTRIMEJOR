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

export function createServer(catalogs, identity, config, readiness) {
  return http.createServer(async (request, response) => {
    const requestId = request.headers["x-request-id"] || crypto.randomUUID();
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const startedAt = Date.now();
    try {
      if (request.method === "GET" && ["/health", "/health/live"].includes(url.pathname)) {
        return send(response, 200, { status: "ok", service: "catalogs-api" }, requestId);
      }
      if (request.method === "GET" && url.pathname === "/health/ready") {
        await readiness();
        return send(response, 200, { status: "ready", service: "catalogs-api" }, requestId);
      }
      if (!equal(request.headers["x-service-key"], config.serviceKey)) {
        throw unauthorized("Cliente de servicio no autorizado.");
      }
      const actor = await identity.authenticate(request.headers.authorization, requestId);

      if (url.pathname === "/v1/nutrients" && request.method === "GET") {
        return send(response, 200, await catalogs.listNutrients(actor), requestId);
      }

      if (url.pathname === "/v1/foods" && request.method === "GET") {
        return send(response, 200, await catalogs.listFoods(actor, {
          search: url.searchParams.get("search") || undefined,
          category: url.searchParams.get("category") || undefined,
          scope: url.searchParams.get("scope") || undefined,
        }), requestId);
      }
      if (url.pathname === "/v1/foods" && request.method === "POST") {
        return send(response, 201, await catalogs.createFood(actor, await readJson(request)), requestId);
      }

      const foodCommand = url.pathname.match(/^\/v1\/foods\/([^/]+)\/(copy|nutrients|portions)$/);
      if (foodCommand) {
        const id = decodeURIComponent(foodCommand[1]);
        if (foodCommand[2] === "copy" && request.method === "POST") {
          return send(response, 201, await catalogs.copyFood(actor, id), requestId);
        }
        if (foodCommand[2] === "nutrients" && request.method === "PUT") {
          return send(response, 200, await catalogs.replaceFoodNutrients(actor, id, await readJson(request)), requestId);
        }
        if (foodCommand[2] === "portions" && request.method === "POST") {
          return send(response, 201, await catalogs.addFoodPortion(actor, id, await readJson(request)), requestId);
        }
      }

      const food = url.pathname.match(/^\/v1\/foods\/([^/]+)$/);
      if (food && request.method === "GET") {
        return send(response, 200, await catalogs.getFood(actor, decodeURIComponent(food[1])), requestId);
      }
      if (food && request.method === "PUT") {
        return send(
          response,
          200,
          await catalogs.updateFood(actor, decodeURIComponent(food[1]), await readJson(request)),
          requestId,
        );
      }

      if (url.pathname === "/v1/household-measures" && request.method === "POST") {
        return send(response, 201, await catalogs.createHouseholdMeasure(actor, await readJson(request)), requestId);
      }

      if (url.pathname === "/v1/recipes" && request.method === "GET") {
        return send(response, 200, await catalogs.listRecipes(actor, url.searchParams.get("search") || undefined), requestId);
      }
      if (url.pathname === "/v1/recipes" && request.method === "POST") {
        return send(response, 201, await catalogs.createRecipe(actor, await readJson(request)), requestId);
      }
      const recipeCopy = url.pathname.match(/^\/v1\/recipes\/([^/]+)\/copy$/);
      if (recipeCopy && request.method === "POST") {
        return send(response, 201, await catalogs.copyRecipe(actor, decodeURIComponent(recipeCopy[1])), requestId);
      }
      const recipe = url.pathname.match(/^\/v1\/recipes\/([^/]+)$/);
      if (recipe && request.method === "GET") {
        return send(response, 200, await catalogs.getRecipe(actor, decodeURIComponent(recipe[1])), requestId);
      }
      if (recipe && request.method === "PUT") {
        return send(
          response,
          200,
          await catalogs.updateRecipe(actor, decodeURIComponent(recipe[1]), await readJson(request)),
          requestId,
        );
      }

      if (url.pathname === "/v1/recommendations" && request.method === "GET") {
        return send(response, 200, await catalogs.listRecommendations(actor), requestId);
      }
      if (url.pathname === "/v1/recommendations" && request.method === "POST") {
        return send(response, 201, await catalogs.createRecommendation(actor, await readJson(request)), requestId);
      }
      if (url.pathname === "/v1/education-resources" && request.method === "GET") {
        return send(response, 200, await catalogs.listEducation(actor), requestId);
      }
      if (url.pathname === "/v1/education-resources" && request.method === "POST") {
        return send(response, 201, await catalogs.createEducation(actor, await readJson(request)), requestId);
      }
      if (url.pathname === "/v1/migrations/legacy-catalogs" && request.method === "POST") {
        return send(response, 200, await catalogs.migrateLegacy(actor), requestId);
      }

      const collection = url.pathname.match(/^\/v1\/catalogs\/([^/]+)$/);
      if (collection && request.method === "GET") {
        return send(response, 200, await catalogs.list(actor, decodeURIComponent(collection[1])), requestId);
      }
      if (collection && request.method === "POST") {
        return send(
          response,
          201,
          await catalogs.create(actor, decodeURIComponent(collection[1]), await readJson(request)),
          requestId,
        );
      }

      const item = url.pathname.match(/^\/v1\/catalogs\/([^/]+)\/([^/]+)$/);
      if (item && request.method === "PUT") {
        return send(
          response,
          200,
          await catalogs.update(
            actor,
            decodeURIComponent(item[1]),
            decodeURIComponent(item[2]),
            await readJson(request),
          ),
          requestId,
        );
      }
      if (item && request.method === "DELETE") {
        await catalogs.remove(actor, decodeURIComponent(item[1]), decodeURIComponent(item[2]));
        return send(response, 204, undefined, requestId);
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

import { DomainError, unavailable } from "../../domain/errors.js";
import { signedServiceHeaders } from "../security/service-auth.js";

export class CatalogsClient {
  constructor(config) {
    this.baseUrl = config.catalogsUrl;
    this.serviceKey = config.serviceKey;
    this.timeoutMs = config.catalogsTimeoutMs;
  }

  getFood(id, context) {
    return this.get(`/v1/foods/${encodeURIComponent(id)}`, context);
  }

  getRecipe(id, context) {
    return this.get(`/v1/recipes/${encodeURIComponent(id)}`, context);
  }

  async get(path, context) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: signedServiceHeaders(this.serviceKey, "GET", path, {
          authorization: context.authorization,
          "x-request-id": context.requestId,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw unavailable("El catálogo no está disponible.");
    }
    if (response.status === 404) {
      throw new DomainError("El alimento o receta no existe para la organización.", 400, "CATALOG_ITEM_NOT_AVAILABLE");
    }
    if (!response.ok) throw unavailable("No se pudo consultar el catálogo.");
    return response.json();
  }
}

import { DomainError, unavailable } from "../../domain/errors.js";
import { signedServiceHeaders } from "../security/service-auth.js";

export class CatalogsClient {
  constructor(config) {
    this.baseUrl = config.catalogsUrl;
    this.serviceKey = config.serviceKey;
    this.timeoutMs = config.catalogsTimeoutMs;
  }

  async getFood(id, authorization, requestId) {
    const path = `/v1/foods/${encodeURIComponent(id)}`;
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: signedServiceHeaders(this.serviceKey, "GET", path, {
          authorization,
          "x-request-id": requestId,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw unavailable("El catálogo de alimentos no está disponible.");
    }
    if (response.status === 404) {
      throw new DomainError("El alimento no existe o no está disponible para la organización.", 400, "FOOD_NOT_AVAILABLE");
    }
    if (!response.ok) throw unavailable("No se pudo consultar el alimento.");
    return response.json();
  }
}

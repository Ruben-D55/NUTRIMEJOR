import { DomainError, unavailable } from "../../domain/errors.js";
import { signedServiceHeaders } from "../security/service-auth.js";

export class EntitlementClient {
  constructor(config) {
    this.baseUrl = config.subscriptionsUrl;
    this.serviceKey = config.serviceKey;
    this.timeoutMs = config.subscriptionsTimeoutMs;
  }
  async assert(organizationId, featureCode) {
    const path = `/v1/internal/organizations/${organizationId}/entitlements`;
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: signedServiceHeaders(this.serviceKey, "GET", path),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw unavailable("El servicio de membresías no está disponible.");
    }
    if (!response.ok) throw unavailable("No se pudo validar la membresía.");
    const payload = await response.json();
    if (!payload.features.some((feature) => feature.code === featureCode && feature.enabled)) {
      throw new DomainError("La función no está incluida en el plan actual.", 403, "FEATURE_NOT_ENTITLED");
    }
  }
}

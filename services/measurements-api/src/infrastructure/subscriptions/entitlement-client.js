import { DomainError, unavailable } from "../../domain/errors.js";

export class EntitlementClient {
  constructor(config) {
    this.baseUrl = config.subscriptionsUrl;
    this.serviceKey = config.serviceKey;
    this.timeoutMs = config.subscriptionsTimeoutMs;
  }
  async assert(organizationId, featureCode) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/v1/internal/organizations/${organizationId}/entitlements`, {
        headers: { "x-service-key": this.serviceKey },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw unavailable("El servicio de membresías no está disponible.");
    }
    if (!response.ok) throw unavailable("No se pudo validar la membresía.");
    const snapshot = await response.json();
    if (!snapshot.features.some((feature) => feature.code === featureCode && feature.enabled)) {
      throw new DomainError("La función no está incluida en el plan actual.", 403, "FEATURE_NOT_ENTITLED");
    }
  }
}

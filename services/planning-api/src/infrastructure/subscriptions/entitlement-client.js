import { DomainError, unavailable } from "../../domain/errors.js";

export class EntitlementClient {
  constructor(config) {
    this.baseUrl = config.subscriptionsUrl;
    this.serviceKey = config.serviceKey;
    this.timeoutMs = config.subscriptionsTimeoutMs;
  }

  async consume(organizationId, featureCode, amount = 1, requestId = crypto.randomUUID()) {
    let response;
    try {
      response = await fetch(
        `${this.baseUrl}/v1/internal/organizations/${encodeURIComponent(organizationId)}/consume`,
        {
          method: "POST",
          headers: {
            "x-service-key": this.serviceKey,
            "x-request-id": requestId,
            "content-type": "application/json",
          },
          body: JSON.stringify({ featureCode, amount }),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch {
      throw unavailable("El servicio de membresías no está disponible.");
    }
    const payload = await response.json().catch(() => ({}));
    if (response.status === 403) throw new DomainError(payload.error || "Función no incluida.", 403, payload.code || "FEATURE_NOT_ENTITLED");
    if (response.status === 409) throw new DomainError(payload.error || "Cuota agotada.", 409, payload.code || "QUOTA_EXCEEDED");
    if (!response.ok) throw unavailable("No se pudo validar la membresía.");
    return payload;
  }

  async assert(organizationId, featureCode, requestId = crypto.randomUUID()) {
    let response;
    try {
      response = await fetch(
        `${this.baseUrl}/v1/internal/organizations/${encodeURIComponent(organizationId)}/entitlements`,
        {
          headers: { "x-service-key": this.serviceKey, "x-request-id": requestId },
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
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

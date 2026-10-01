import { createRemoteJWKSet, jwtVerify } from "jose";
import { unauthorized } from "../../domain/errors.js";

export class IdentityClient {
  constructor(config) {
    this.issuer = "nutrimejor-identity";
    this.audience = "nutrimejor-services";
    this.jwks = createRemoteJWKSet(new URL(`${config.identityUrl}/.well-known/jwks.json`), {
      cooldownDuration: 5000,
      cacheMaxAge: 600000,
      timeoutDuration: config.identityTimeoutMs,
    });
  }

  async authenticate(authorization) {
    if (!authorization?.startsWith("Bearer ")) throw unauthorized();
    try {
      const { payload } = await jwtVerify(authorization.slice(7), this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ["RS256"],
      });
      if (!payload.sub || !payload.organizationId || !payload.organizationRole) throw unauthorized();
      return {
        id: Number(payload.sub),
        name: payload.name,
        role: payload.role,
        organizationId: payload.organizationId,
        organizationRole: payload.organizationRole,
      };
    } catch (error) {
      if (error?.status === 401) throw error;
      throw unauthorized("Token inválido o vencido.");
    }
  }
}

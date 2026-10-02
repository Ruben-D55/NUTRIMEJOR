import { createRemoteJWKSet, jwtVerify } from "jose";

export class JwtVerifier {
  constructor(identityUrl, issuer, audience) {
    this.keys = createRemoteJWKSet(new URL("/.well-known/jwks.json", identityUrl));
    this.issuer = issuer;
    this.audience = audience;
  }

  async verify(header) {
    if (!header?.startsWith("Bearer ")) throw new Error("missing_token");
    const { payload } = await jwtVerify(header.slice(7), this.keys, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ["RS256"],
    });
    return {
      id: payload.sub,
      organizationId: payload.organizationId,
      organizationRole: payload.organizationRole,
      patientId: payload.patientId,
    };
  }
}

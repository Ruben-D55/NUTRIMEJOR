import { createPublicKey } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  SignJWT,
  calculateJwkThumbprint,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  jwtVerify,
} from "jose";
import { config } from "../../config.js";

async function loadOrCreateKeys() {
  let privatePem;
  let publicPem;
  try {
    [privatePem, publicPem] = await Promise.all([
      readFile(config.jwtPrivateKeyPath, "utf8"),
      readFile(config.jwtPublicKeyPath, "utf8"),
    ]);
  } catch {
    await mkdir(dirname(config.jwtPrivateKeyPath), { recursive: true });
    const generated = await generateKeyPair("RS256", { extractable: true });
    privatePem = await exportPKCS8(generated.privateKey);
    publicPem = createPublicKey(privatePem).export({ type: "spki", format: "pem" });
    await Promise.all([
      writeFile(config.jwtPrivateKeyPath, privatePem, { mode: 0o600 }),
      writeFile(config.jwtPublicKeyPath, publicPem, { mode: 0o644 }),
    ]);
  }
  const privateKey = await importPKCS8(privatePem, "RS256");
  const publicKey = await importSPKI(publicPem, "RS256");
  const publicJwk = await exportJWK(publicKey);
  const kid = await calculateJwkThumbprint(publicJwk);
  return {
    privateKey,
    publicKey,
    jwks: { keys: [{ ...publicJwk, kid, use: "sig", alg: "RS256" }] },
    kid,
  };
}

export class JwtService {
  constructor() {
    this.keys = loadOrCreateKeys();
  }

  async sign(user) {
    const keys = await this.keys;
    return new SignJWT({
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      organizationRole: user.organizationRole,
    })
      .setProtectedHeader({ alg: "RS256", kid: keys.kid, typ: "JWT" })
      .setSubject(String(user.id))
      .setIssuer(config.jwtIssuer)
      .setAudience(config.jwtAudience)
      .setIssuedAt()
      .setExpirationTime("30m")
      .sign(keys.privateKey);
  }

  async verify(token) {
    const keys = await this.keys;
    const { payload } = await jwtVerify(token, keys.publicKey, {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      algorithms: ["RS256"],
    });
    return {
      id: Number(payload.sub),
      name: payload.name,
      role: payload.role,
      organizationId: payload.organizationId,
      organizationRole: payload.organizationRole,
    };
  }

  async jwks() {
    return (await this.keys).jwks;
  }
}

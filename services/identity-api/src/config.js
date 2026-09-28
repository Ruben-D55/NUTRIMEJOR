function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export const config = {
  port: integer(process.env.PORT, 4001),
  serviceKey: process.env.SERVICE_API_KEY || "development-only-key",
  jwtPrivateKeyPath: process.env.JWT_PRIVATE_KEY_PATH || "/data/jwt-private.pem",
  jwtPublicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || "/data/jwt-public.pem",
  jwtIssuer: process.env.JWT_ISSUER || "nutrimejor-identity",
  jwtAudience: process.env.JWT_AUDIENCE || "nutrimejor-services",
  exposeDevelopmentTokens: process.env.EXPOSE_DEVELOPMENT_TOKENS === "true",
  db: {
    server: process.env.DB_SERVER || "localhost",
    port: integer(process.env.DB_PORT, 14331),
    database: process.env.DB_NAME || "NutrimejorIdentity",
    user: process.env.DB_USER || "sa",
    password: process.env.DB_PASSWORD || "ChangeIdentityPassword123!",
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERTIFICATE !== "false",
    pool: { max: integer(process.env.DB_POOL_MAX, 10), min: 0, idleTimeoutMillis: 30000 },
  },
};

if (!/^[A-Za-z0-9_]+$/.test(config.db.database)) {
  throw new Error("DB_NAME contiene caracteres no permitidos.");
}

if (process.env.NODE_ENV === "production") {
  if (config.serviceKey === "development-only-key" || config.serviceKey.length < 24) {
    throw new Error("SERVICE_API_KEY debe configurarse con al menos 24 caracteres.");
  }
}

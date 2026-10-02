function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export const config = {
  port: integer(process.env.PORT, 4001),
  serviceKey: process.env.SERVICE_API_KEY || "",
  jwtPrivateKeyPath: process.env.JWT_PRIVATE_KEY_PATH || "/data/jwt-private.pem",
  jwtPublicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || "/data/jwt-public.pem",
  jwtIssuer: process.env.JWT_ISSUER || "nutrimejor-identity",
  jwtAudience: process.env.JWT_AUDIENCE || "nutrimejor-services",
  exposeDevelopmentTokens: process.env.EXPOSE_DEVELOPMENT_TOKENS === "true",
  accessTokenMinutes: integer(process.env.ACCESS_TOKEN_MINUTES, 10),
  refreshTokenDays: integer(process.env.REFRESH_TOKEN_DAYS, 7),
  db: {
    server: process.env.DB_SERVER || "localhost",
    port: integer(process.env.DB_PORT, 14331),
    database: process.env.DB_NAME || "NutrimejorIdentity",
    user: process.env.DB_USER || "sa",
    password: process.env.DB_PASSWORD || "",
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERTIFICATE !== "false",
    pool: { max: integer(process.env.DB_POOL_MAX, 10), min: 0, idleTimeoutMillis: 30000 },
  },
};

if (!/^[A-Za-z0-9_]+$/.test(config.db.database)) {
  throw new Error("DB_NAME contiene caracteres no permitidos.");
}
if (process.env.NODE_ENV === "production" && config.db.password.length < 16) throw new Error("DB_PASSWORD debe configurarse fuera del código.");

if (process.env.NODE_ENV === "production") {
  if (config.serviceKey.length < 32) {
    throw new Error("SERVICE_API_KEY debe configurarse con al menos 32 caracteres.");
  }
  if (config.accessTokenMinutes < 5 || config.accessTokenMinutes > 30) throw new Error("ACCESS_TOKEN_MINUTES debe estar entre 5 y 30.");
  if (config.refreshTokenDays < 1 || config.refreshTokenDays > 30) throw new Error("REFRESH_TOKEN_DAYS debe estar entre 1 y 30.");
}

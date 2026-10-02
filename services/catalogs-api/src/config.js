function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export const config = {
  port: integer(process.env.PORT, 4003),
  serviceKey: process.env.SERVICE_API_KEY || "",
  identityUrl: process.env.IDENTITY_API_URL || "http://localhost:4001",
  identityTimeoutMs: integer(process.env.IDENTITY_TIMEOUT_MS, 3000),
  db: {
    server: process.env.DB_SERVER || "localhost",
    port: integer(process.env.DB_PORT, 14333),
    database: process.env.DB_NAME || "NutrimejorCatalogs",
    user: process.env.DB_USER || "sa",
    password: process.env.DB_PASSWORD || "",
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERTIFICATE !== "false",
    pool: { max: integer(process.env.DB_POOL_MAX, 10), min: 0, idleTimeoutMillis: 30000 },
  },
};

if (!/^[A-Za-z0-9_]+$/.test(config.db.database)) throw new Error("DB_NAME inválido.");
if (process.env.NODE_ENV === "production" && config.db.password.length < 16) throw new Error("DB_PASSWORD debe configurarse fuera del código.");
if (process.env.NODE_ENV === "production" && config.serviceKey.length < 32) {
  throw new Error("SERVICE_API_KEY debe tener al menos 32 caracteres.");
}

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export const config = {
  serviceName: "measurements-api",
  port: integer(process.env.PORT, 4006),
  serviceKey: process.env.SERVICE_API_KEY || "",
  identityUrl: process.env.IDENTITY_API_URL || "http://localhost:4001",
  identityTimeoutMs: integer(process.env.IDENTITY_TIMEOUT_MS, 3000),
  migration: "001_measurement_sessions.sql",
  resourcePath: "/v1/measurement-sessions",
  table: "MeasurementSessions",
  idColumn: "IdMeasurementSession",
  eventPrefix: "measurements",
  rabbitmqUrl: process.env.RABBITMQ_URL || "",
  subscriptionsUrl: process.env.SUBSCRIPTIONS_API_URL || "http://localhost:4004",
  subscriptionsTimeoutMs: integer(process.env.SUBSCRIPTIONS_TIMEOUT_MS, 3000),
  db: {
    server: process.env.DB_SERVER || "localhost",
    port: integer(process.env.DB_PORT, 14334),
    database: process.env.DB_NAME || "NutrimejorMeasurements",
    user: process.env.DB_USER || "sa",
    password: process.env.DB_PASSWORD || "",
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERTIFICATE !== "false",
    pool: { max: integer(process.env.DB_POOL_MAX, 8), min: 0, idleTimeoutMillis: 30000 },
  },
};

if (!/^[A-Za-z0-9_]+$/.test(config.db.database)) throw new Error("DB_NAME inválido.");
if (process.env.NODE_ENV === "production" && config.db.password.length < 16) throw new Error("DB_PASSWORD debe configurarse fuera del código.");
if (process.env.NODE_ENV === "production" && config.serviceKey.length < 32) {
  throw new Error("SERVICE_API_KEY debe tener al menos 32 caracteres.");
}

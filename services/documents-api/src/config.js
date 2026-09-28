function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export const config = {
  serviceName: "documents-api",
  port: integer(process.env.PORT, 4011),
  serviceKey: process.env.SERVICE_API_KEY || "development-only-key",
  identityUrl: process.env.IDENTITY_API_URL || "http://localhost:4001",
  identityTimeoutMs: integer(process.env.IDENTITY_TIMEOUT_MS, 3000),
  migration: "001_documents.sql",
  resourcePath: "/v1/documents",
  table: "DocumentRequests",
  idColumn: "IdDocumentRequest",
  eventPrefix: "documents",
  rabbitmqUrl: process.env.RABBITMQ_URL || "",
  storagePath: process.env.OBJECT_STORAGE_PATH || "./data/documents",
  subscriptionsUrl: process.env.SUBSCRIPTIONS_API_URL || "http://localhost:4004",
  subscriptionsTimeoutMs: integer(process.env.SUBSCRIPTIONS_TIMEOUT_MS, 3000),
  db: {
    server: process.env.DB_SERVER || "localhost",
    port: integer(process.env.DB_PORT, 14334),
    database: process.env.DB_NAME || "NutrimejorDocuments",
    user: process.env.DB_USER || "sa",
    password: process.env.DB_PASSWORD || "ChangePlatformPassword123!",
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERTIFICATE !== "false",
    pool: { max: integer(process.env.DB_POOL_MAX, 8), min: 0, idleTimeoutMillis: 30000 },
  },
};

if (!/^[A-Za-z0-9_]+$/.test(config.db.database)) throw new Error("DB_NAME inválido.");
if (process.env.NODE_ENV === "production" && config.serviceKey.length < 24) {
  throw new Error("SERVICE_API_KEY debe tener al menos 24 caracteres.");
}

function integer(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

const urls = {
  identity: process.env.IDENTITY_API_URL || "http://localhost:4001",
  patients: process.env.PATIENTS_API_URL || "http://localhost:4002",
  catalogs: process.env.CATALOGS_API_URL || "http://localhost:4003",
  subscriptions: process.env.SUBSCRIPTIONS_API_URL || "http://localhost:4004",
  clinical: process.env.CLINICAL_API_URL || "http://localhost:4005",
  measurements: process.env.MEASUREMENTS_API_URL || "http://localhost:4006",
  nutrition: process.env.NUTRITION_API_URL || "http://localhost:4007",
  planning: process.env.PLANNING_API_URL || "http://localhost:4008",
  scheduling: process.env.SCHEDULING_API_URL || "http://localhost:4009",
  notifications: process.env.NOTIFICATIONS_API_URL || "http://localhost:4010",
  documents: process.env.DOCUMENTS_API_URL || "http://localhost:4011",
  reporting: process.env.REPORTING_API_URL || "http://localhost:4012",
};

export const config = {
  port: integer(process.env.PORT, 4080, 1, 65535),
  serviceKey: process.env.SERVICE_API_KEY || "",
  jwtIssuer: process.env.JWT_ISSUER || "nutrimejor-identity",
  jwtAudience: process.env.JWT_AUDIENCE || "nutrimejor-services",
  serviceUrls: urls,
  allowedOrigins: new Set((process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5050")
    .split(",").map((value) => value.trim()).filter(Boolean)),
  timeoutMs: integer(process.env.GATEWAY_TIMEOUT_MS, 5000, 250, 30000),
  retries: integer(process.env.GATEWAY_RETRIES, 2, 0, 4),
  circuitFailures: integer(process.env.CIRCUIT_FAILURE_THRESHOLD, 5, 1, 20),
  circuitOpenMs: integer(process.env.CIRCUIT_OPEN_MS, 30000, 1000, 300000),
  otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "",
};

if (config.serviceKey.length < 32) throw new Error("SERVICE_API_KEY debe tener al menos 32 caracteres.");

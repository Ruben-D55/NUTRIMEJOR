from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

SERVICES = [
    {"slug": "subscriptions-api", "port": 4004, "db": "NutrimejorSubscriptions", "table": "Subscriptions", "id": "IdSubscription", "path": "subscriptions", "label": "suscripción"},
    {"slug": "clinical-api", "port": 4005, "db": "NutrimejorClinical", "table": "Consultations", "id": "IdConsultation", "path": "consultations", "label": "consulta"},
    {"slug": "measurements-api", "port": 4006, "db": "NutrimejorMeasurements", "table": "MeasurementSessions", "id": "IdMeasurementSession", "path": "measurement-sessions", "label": "sesión de medición"},
    {"slug": "nutrition-api", "port": 4007, "db": "NutrimejorNutrition", "table": "NutritionAssessments", "id": "IdNutritionAssessment", "path": "nutrition-assessments", "label": "evaluación nutricional"},
    {"slug": "planning-api", "port": 4008, "db": "NutrimejorPlanning", "table": "MealPlans", "id": "IdMealPlan", "path": "meal-plans", "label": "plan alimentario"},
    {"slug": "scheduling-api", "port": 4009, "db": "NutrimejorScheduling", "table": "Appointments", "id": "IdAppointment", "path": "appointments", "label": "cita"},
    {"slug": "notifications-api", "port": 4010, "db": "NutrimejorNotifications", "table": "NotificationJobs", "id": "IdNotification", "path": "notifications", "label": "notificación"},
    {"slug": "documents-api", "port": 4011, "db": "NutrimejorDocuments", "table": "DocumentRequests", "id": "IdDocumentRequest", "path": "documents", "label": "documento"},
    {"slug": "reporting-api", "port": 4012, "db": "NutrimejorReporting", "table": "ReportSnapshots", "id": "IdReportSnapshot", "path": "report-snapshots", "label": "reporte"},
]


def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.strip() + "\n", encoding="utf-8")


for service in SERVICES:
    root = ROOT / "services" / service["slug"]
    package = {
        "name": f"@nutrimejor/{service['slug']}",
        "version": "1.0.0",
        "private": True,
        "type": "module",
        "scripts": {
            "start": "node src/index.js",
            "dev": "node --watch src/index.js",
            "check": "node --check src/index.js",
            "test": "node --test",
        },
        "dependencies": {"amqplib": "^0.10.4", "jose": "^6.2.9", "mssql": "12.7.0", "zod": "4.4.3"},
    }
    write(root / "package.json", json.dumps(package, indent=2, ensure_ascii=False))

    write(root / "Dockerfile", f"""
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY database ./database
ENV NODE_ENV=production PORT={service['port']}
USER node
EXPOSE {service['port']}
CMD ["node", "src/index.js"]
""")

    write(root / f"database/001_{service['path'].replace('-', '_')}.sql", f"""
IF OBJECT_ID('{service['table']}', 'U') IS NULL
BEGIN
  CREATE TABLE {service['table']} (
    {service['id']} UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NULL,
    IdNutricionista INT NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NULL,
    Titulo NVARCHAR(200) NOT NULL,
    Estado VARCHAR(30) NOT NULL DEFAULT 'draft',
    Datos NVARCHAR(MAX) NOT NULL DEFAULT '{{}}'
      CHECK (ISJSON(Datos) = 1),
    Version INT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_{service['table']}_OwnerPatient
    ON {service['table']} (IdNutricionista, IdPaciente, FechaActualizacion DESC);
END;

IF COL_LENGTH('{service['table']}', 'IdOrganizacion') IS NULL
BEGIN
  ALTER TABLE {service['table']} ADD IdOrganizacion UNIQUEIDENTIFIER NULL;
END;

IF OBJECT_ID('OutboxMessages', 'U') IS NULL
BEGIN
  CREATE TABLE OutboxMessages (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EventType NVARCHAR(160) NOT NULL,
    AggregateId UNIQUEIDENTIFIER NOT NULL,
    Payload NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Payload) = 1),
    OcurredAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    PublishedAt DATETIME2 NULL,
    Attempts INT NOT NULL DEFAULT 0
  );
  CREATE INDEX IX_OutboxMessages_Pending ON OutboxMessages (PublishedAt, OcurredAt);
END;
""")

    write(root / "src/domain/errors.js", """
export class DomainError extends Error {
  constructor(message, status = 400, code = "DOMAIN_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (message = "Recurso no encontrado.") =>
  new DomainError(message, 404, "NOT_FOUND");
export const unauthorized = (message = "No autorizado.") =>
  new DomainError(message, 401, "UNAUTHORIZED");
export const unavailable = (message = "Dependencia no disponible.") =>
  new DomainError(message, 503, "DEPENDENCY_UNAVAILABLE");
""")

    write(root / "src/domain/record.js", f"""
import {{ z }} from "zod";

export const recordId = z.string().uuid();

export const recordInput = z.object({{
  patientId: z.string().uuid().nullable().optional().default(null),
  title: z.string().trim().min(2).max(200),
  status: z.string().trim().min(2).max(30).optional().default("draft"),
  data: z.record(z.string(), z.unknown()).optional().default({{}}),
}});

export const statusInput = z.object({{
  status: z.string().trim().min(2).max(30),
}});

export const resource = Object.freeze({{
  label: "{service['label']}",
  path: "/v1/{service['path']}",
  eventPrefix: "{service['slug'].replace('-api', '')}",
}});
""")

    write(root / "src/application/record-service.js", """
import { recordId, recordInput, statusInput } from "../domain/record.js";
import { notFound } from "../domain/errors.js";

export class RecordService {
  constructor(repository) {
    this.repository = repository;
  }

  list(actor, patientId) {
    const normalizedPatientId = patientId ? recordId.parse(patientId) : null;
    return this.repository.list(actor, normalizedPatientId);
  }

  async get(actor, id) {
    const item = await this.repository.get(actor, recordId.parse(id));
    if (!item) throw notFound();
    return item;
  }

  create(actor, input) {
    return this.repository.create(actor, recordInput.parse(input));
  }

  async update(actor, id, input) {
    const item = await this.repository.update(actor, recordId.parse(id), recordInput.parse(input));
    if (!item) throw notFound();
    return item;
  }

  async changeStatus(actor, id, input) {
    const item = await this.repository.changeStatus(
      actor,
      recordId.parse(id),
      statusInput.parse(input).status,
    );
    if (!item) throw notFound();
    return item;
  }
}
""")

    migration_name = f"001_{service['path'].replace('-', '_')}.sql"
    write(root / "src/config.js", f"""
function integer(value, fallback) {{
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}}

export const config = {{
  serviceName: "{service['slug']}",
  port: integer(process.env.PORT, {service['port']}),
  serviceKey: process.env.SERVICE_API_KEY || "development-only-key",
  identityUrl: process.env.IDENTITY_API_URL || "http://localhost:4001",
  identityTimeoutMs: integer(process.env.IDENTITY_TIMEOUT_MS, 3000),
  migration: "{migration_name}",
  resourcePath: "/v1/{service['path']}",
  table: "{service['table']}",
  idColumn: "{service['id']}",
  eventPrefix: "{service['slug'].replace('-api', '')}",
  rabbitmqUrl: process.env.RABBITMQ_URL || "",
  db: {{
    server: process.env.DB_SERVER || "localhost",
    port: integer(process.env.DB_PORT, 14334),
    database: process.env.DB_NAME || "{service['db']}",
    user: process.env.DB_USER || "sa",
    password: process.env.DB_PASSWORD || "ChangePlatformPassword123!",
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERTIFICATE !== "false",
    pool: {{ max: integer(process.env.DB_POOL_MAX, 8), min: 0, idleTimeoutMillis: 30000 }},
  }},
}};

if (!/^[A-Za-z0-9_]+$/.test(config.db.database)) throw new Error("DB_NAME inválido.");
if (process.env.NODE_ENV === "production" && config.serviceKey.length < 24) {{
  throw new Error("SERVICE_API_KEY debe tener al menos 24 caracteres.");
}}
""")

    write(root / "src/infrastructure/identity/identity-client.js", """
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
""")

    write(root / "src/infrastructure/sql/database.js", """
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import sql from "mssql";
import { config } from "../../config.js";

let poolPromise;

const connection = (database) => ({
  server: config.db.server,
  port: config.db.port,
  database,
  user: config.db.user,
  password: config.db.password,
  options: { encrypt: config.db.encrypt, trustServerCertificate: config.db.trustServerCertificate },
  pool: config.db.pool,
});

async function connect(database, attempts = 30) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await new sql.ConnectionPool(connection(database)).connect();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

async function migrate(pool) {
  await pool.request().query(`IF OBJECT_ID('SchemaMigrations', 'U') IS NULL
    CREATE TABLE SchemaMigrations (
      FileName NVARCHAR(255) PRIMARY KEY,
      Checksum CHAR(64) NOT NULL,
      AppliedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    )`);
  const directory = new URL("../../../database/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => /^\\d+.*\\.sql$/i.test(file)).sort();
  for (const file of files) {
    const migration = await readFile(new URL(file, directory), "utf8");
    const checksum = createHash("sha256").update(migration).digest("hex");
    const applied = await pool.request()
      .input("file", sql.NVarChar(255), file)
      .query("SELECT Checksum AS checksum FROM SchemaMigrations WHERE FileName=@file");
    if (applied.recordset[0]) {
      if (applied.recordset[0].checksum !== checksum) {
        throw new Error(`La migración aplicada ${{file}} cambió de contenido.`);
      }
      continue;
    }
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).batch(migration);
      await new sql.Request(transaction)
        .input("file", sql.NVarChar(255), file)
        .input("checksum", sql.Char(64), checksum)
        .query("INSERT INTO SchemaMigrations (FileName, Checksum) VALUES (@file, @checksum)");
      await transaction.commit();
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }
}

async function initialize() {
  const master = await connect("master");
  await master.request().query(
    `IF DB_ID(N'${config.db.database}') IS NULL CREATE DATABASE [${config.db.database}]`,
  );
  await master.close();
  const pool = await connect(config.db.database);
  await migrate(pool);
  return pool;
}

export function database() {
  poolPromise ||= initialize();
  return poolPromise;
}

export async function ready() {
  const pool = await database();
  await pool.request().query("SELECT 1 AS ok");
}

export { sql };
""")

    write(root / "src/infrastructure/messaging/outbox-repository.js", """
import { database, sql } from "../sql/database.js";

export class SqlOutboxRepository {
  async pending(limit = 50) {
    const pool = await database();
    const result = await pool.request()
      .input("limit", sql.Int, limit)
      .query(`SELECT TOP (@limit) Id AS id, EventType AS eventType, Payload AS payload
              FROM OutboxMessages
              WHERE PublishedAt IS NULL AND Attempts < 20
              ORDER BY OcurredAt`);
    return result.recordset;
  }

  async markPublished(id) {
    const pool = await database();
    await pool.request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`UPDATE OutboxMessages
              SET PublishedAt=SYSUTCDATETIME(), Attempts=Attempts+1
              WHERE Id=@id AND PublishedAt IS NULL`);
  }

  async markFailed(id) {
    const pool = await database();
    await pool.request()
      .input("id", sql.UniqueIdentifier, id)
      .query("UPDATE OutboxMessages SET Attempts=Attempts+1 WHERE Id=@id AND PublishedAt IS NULL");
  }
}
""")

    write(root / "src/infrastructure/messaging/outbox-publisher.js", """
import amqp from "amqplib";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function startOutboxPublisher(repository, config) {
  if (!config.rabbitmqUrl) return;
  for (;;) {
    let connection;
    try {
      connection = await amqp.connect(config.rabbitmqUrl);
      const channel = await connection.createConfirmChannel();
      await channel.assertExchange("nutrimejor.events", "topic", { durable: true });
      console.log(JSON.stringify({ service: config.serviceName, message: "outbox connected" }));

      while (connection.connection.stream.readable) {
        const messages = await repository.pending();
        for (const message of messages) {
          try {
            channel.publish(
              "nutrimejor.events",
              message.eventType,
              Buffer.from(message.payload),
              {
                persistent: true,
                contentType: "application/json",
                messageId: String(message.id),
                type: message.eventType,
              },
            );
            await channel.waitForConfirms();
            await repository.markPublished(message.id);
          } catch (error) {
            await repository.markFailed(message.id);
            throw error;
          }
        }
        await wait(messages.length ? 100 : 1000);
      }
    } catch (error) {
      console.error(JSON.stringify({
        service: config.serviceName,
        message: "outbox unavailable; retrying",
        error: error?.message || String(error),
      }));
      try { await connection?.close(); } catch {}
      await wait(5000);
    }
  }
}
""")

    write(root / "src/infrastructure/sql/record-repository.js", """
import { config } from "../../config.js";
import { database, sql } from "./database.js";

function map(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patientId,
    title: row.title,
    status: row.status,
    data: JSON.parse(row.data || "{}"),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const select = `
  SELECT ${config.idColumn} AS id, IdPaciente AS patientId, Titulo AS title,
         Estado AS status, Datos AS data, Version AS version,
         FechaCreacion AS createdAt, FechaActualizacion AS updatedAt
  FROM ${config.table}`;

export class SqlRecordRepository {
  async list(actor, patientId) {
    const pool = await database();
    const request = pool.request()
      .input("owner", sql.Int, actor.id)
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId);
    let where = "IdOrganizacion = @organizationId";
    if (patientId) {
      request.input("patientId", sql.UniqueIdentifier, patientId);
      where += " AND IdPaciente = @patientId";
    }
    const result = await request.query(`${select} WHERE ${where} ORDER BY FechaActualizacion DESC`);
    return result.recordset.map(map);
  }

  async get(actor, id) {
    const pool = await database();
    const result = await pool.request()
      .input("owner", sql.Int, actor.id)
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`${select} WHERE IdOrganizacion = @organizationId AND ${config.idColumn} = @id`);
    return map(result.recordset[0]);
  }

  async create(actor, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input("owner", sql.Int, actor.id)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("title", sql.NVarChar(200), input.title)
        .input("status", sql.VarChar(30), input.status)
        .input("data", sql.NVarChar(sql.MAX), JSON.stringify(input.data))
        .query(`INSERT INTO ${config.table} (IdOrganizacion, IdNutricionista, IdPaciente, Titulo, Estado, Datos)
                OUTPUT INSERTED.${config.idColumn} AS id
                VALUES (@organizationId, @owner, @patientId, @title, @status, @data)`);
      const id = result.recordset[0].id;
      await this.addEvent(transaction, `${config.eventPrefix}.created.v1`, id, actor, input);
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async update(actor, id, input) {
    const pool = await database();
    const result = await pool.request()
      .input("owner", sql.Int, actor.id)
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .input("patientId", sql.UniqueIdentifier, input.patientId)
      .input("title", sql.NVarChar(200), input.title)
      .input("status", sql.VarChar(30), input.status)
      .input("data", sql.NVarChar(sql.MAX), JSON.stringify(input.data))
      .query(`UPDATE ${config.table}
              SET IdPaciente=@patientId, Titulo=@title, Estado=@status, Datos=@data,
                  Version=Version+1, FechaActualizacion=SYSUTCDATETIME()
              WHERE IdOrganizacion=@organizationId AND ${config.idColumn}=@id`);
    return result.rowsAffected[0] ? this.get(actor, id) : null;
  }

  async changeStatus(actor, id, status) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input("owner", sql.Int, actor.id)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("id", sql.UniqueIdentifier, id)
        .input("status", sql.VarChar(30), status)
        .query(`UPDATE ${config.table}
                SET Estado=@status, Version=Version+1, FechaActualizacion=SYSUTCDATETIME()
                WHERE IdOrganizacion=@organizationId AND ${config.idColumn}=@id`);
      if (!result.rowsAffected[0]) {
        await transaction.rollback();
        return null;
      }
      await this.addEvent(transaction, `${config.eventPrefix}.status_changed.v1`, id, actor, { status });
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async addEvent(transaction, eventType, aggregateId, actor, data) {
    const payload = JSON.stringify({
      eventId: crypto.randomUUID(),
      eventType,
      occurredAt: new Date().toISOString(),
      actorId: actor.id,
      organizationId: actor.organizationId,
      aggregateId,
      data,
    });
    await new sql.Request(transaction)
      .input("eventType", sql.NVarChar(160), eventType)
      .input("aggregateId", sql.UniqueIdentifier, aggregateId)
      .input("payload", sql.NVarChar(sql.MAX), payload)
      .query(`INSERT INTO OutboxMessages (EventType, AggregateId, Payload)
              VALUES (@eventType, @aggregateId, @payload)`);
  }
}
""")

    write(root / "src/interfaces/http/server.js", """
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { DomainError, unauthorized } from "../../domain/errors.js";

function send(response, status, body, requestId) {
  const headers = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": requestId,
  };
  if (body !== undefined) headers["content-type"] = "application/json; charset=utf-8";
  response.writeHead(status, headers);
  response.end(body === undefined ? "" : JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new DomainError("Solicitud demasiado grande.", 413, "PAYLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new DomainError("El cuerpo debe ser JSON válido.", 400, "INVALID_JSON");
  }
}

function equal(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createServer(records, identity, config, readiness) {
  return http.createServer(async (request, response) => {
    const requestId = request.headers["x-request-id"] || crypto.randomUUID();
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const startedAt = Date.now();
    try {
      if (request.method === "GET" && ["/health", "/health/live"].includes(url.pathname)) {
        return send(response, 200, { status: "ok", service: config.serviceName }, requestId);
      }
      if (request.method === "GET" && url.pathname === "/health/ready") {
        await readiness();
        return send(response, 200, { status: "ready", service: config.serviceName }, requestId);
      }
      if (!equal(request.headers["x-service-key"], config.serviceKey)) {
        throw unauthorized("Cliente de servicio no autorizado.");
      }
      const actor = await identity.authenticate(request.headers.authorization, requestId);

      if (url.pathname === config.resourcePath && request.method === "GET") {
        return send(response, 200, await records.list(actor, url.searchParams.get("patientId")), requestId);
      }
      if (url.pathname === config.resourcePath && request.method === "POST") {
        return send(response, 201, await records.create(actor, await readJson(request)), requestId);
      }

      const status = url.pathname.match(new RegExp(`^${config.resourcePath}/([^/]+)/status$`));
      if (status && request.method === "POST") {
        return send(response, 200, await records.changeStatus(actor, decodeURIComponent(status[1]), await readJson(request)), requestId);
      }

      const item = url.pathname.match(new RegExp(`^${config.resourcePath}/([^/]+)$`));
      if (item && request.method === "GET") {
        return send(response, 200, await records.get(actor, decodeURIComponent(item[1])), requestId);
      }
      if (item && request.method === "PUT") {
        return send(response, 200, await records.update(actor, decodeURIComponent(item[1]), await readJson(request)), requestId);
      }
      return send(response, 404, { error: "Ruta no encontrada.", code: "ROUTE_NOT_FOUND" }, requestId);
    } catch (error) {
      if (error instanceof ZodError) {
        send(response, 400, { error: error.issues[0]?.message || "Datos inválidos.", code: "VALIDATION_ERROR" }, requestId);
      } else if (error instanceof DomainError) {
        send(response, error.status, { error: error.message, code: error.code }, requestId);
      } else {
        console.error(JSON.stringify({ requestId, error: error?.stack || String(error) }));
        send(response, 500, { error: "Error interno del servicio.", code: "INTERNAL_ERROR" }, requestId);
      }
    } finally {
      console.log(JSON.stringify({ requestId, method: request.method, path: url.pathname, ms: Date.now() - startedAt }));
    }
  });
}
""")

    write(root / "src/index.js", """
import { config } from "./config.js";
import { RecordService } from "./application/record-service.js";
import { IdentityClient } from "./infrastructure/identity/identity-client.js";
import { SqlOutboxRepository } from "./infrastructure/messaging/outbox-repository.js";
import { startOutboxPublisher } from "./infrastructure/messaging/outbox-publisher.js";
import { database, ready } from "./infrastructure/sql/database.js";
import { SqlRecordRepository } from "./infrastructure/sql/record-repository.js";
import { createServer } from "./interfaces/http/server.js";

await database();

const records = new RecordService(new SqlRecordRepository());
const identity = new IdentityClient(config);
startOutboxPublisher(new SqlOutboxRepository(), config);

createServer(records, identity, config, ready).listen(config.port, "0.0.0.0", () => {
  console.log(`${config.serviceName} listening on ${config.port}`);
});
""")

    write(root / "test/record-service.test.js", f"""
import assert from "node:assert/strict";
import test from "node:test";
import {{ RecordService }} from "../src/application/record-service.js";

test("creates a validated {service['label']}", async () => {{
  let received;
  const repository = {{ create: async (actor, input) => ((received = {{ actor, input }}), {{ id: "ok" }}) }};
  const service = new RecordService(repository);
  const actor = {{ id: 7 }};
  const result = await service.create(actor, {{ title: "Registro válido", data: {{ source: "test" }} }});
  assert.equal(result.id, "ok");
  assert.equal(received.actor.id, 7);
  assert.equal(received.input.status, "draft");
}});

test("rejects an invalid patient id", () => {{
  const service = new RecordService({{ list: async () => [] }});
  assert.throws(() => service.list({{ id: 7 }}, "invalid"));
}});
""")

    write(root / "openapi.yaml", f"""
openapi: 3.1.0
info:
  title: {service['slug']}
  version: 1.0.0
paths:
  /health/live:
    get:
      responses:
        '200': {{ description: Proceso activo }}
  /health/ready:
    get:
      responses:
        '200': {{ description: Servicio listo }}
  /v1/{service['path']}:
    get:
      parameters:
        - in: query
          name: patientId
          schema: {{ type: string, format: uuid }}
      responses:
        '200': {{ description: Listado }}
    post:
      responses:
        '201': {{ description: Creado }}
  /v1/{service['path']}/{{id}}:
    get:
      parameters:
        - in: path
          name: id
          required: true
          schema: {{ type: string, format: uuid }}
      responses:
        '200': {{ description: Encontrado }}
        '404': {{ description: No encontrado }}
    put:
      parameters:
        - in: path
          name: id
          required: true
          schema: {{ type: string, format: uuid }}
      responses:
        '200': {{ description: Actualizado }}
  /v1/{service['path']}/{{id}}/status:
    post:
      parameters:
        - in: path
          name: id
          required: true
          schema: {{ type: string, format: uuid }}
      responses:
        '200': {{ description: Estado actualizado }}
""")

print(f"Generated {len(SERVICES)} domain services")

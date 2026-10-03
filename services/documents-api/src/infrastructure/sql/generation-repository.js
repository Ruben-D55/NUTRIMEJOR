import { createHash, randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { database, sql } from "./database.js";

function map(row) {
  return row && {
    id: row.id,
    patientId: row.patientId,
    title: row.title,
    status: row.status,
    documentType: row.documentType,
    templateId: row.templateId,
    payload: JSON.parse(row.payload || "{}"),
    contentType: row.contentType,
    fileSize: row.fileSize === null ? null : Number(row.fileSize),
    sha256: row.sha256,
    requestedAt: row.requestedAt,
    completedAt: row.completedAt,
    failureReason: row.failureReason,
  };
}

const select = `SELECT IdDocumentRequest AS id, IdPaciente AS patientId, Titulo AS title,
  Estado AS status, DocumentType AS documentType, TemplateId AS templateId,
  Payload AS payload, ContentType AS contentType, FileSize AS fileSize, Sha256 AS sha256,
  RequestedAt AS requestedAt, CompletedAt AS completedAt, FailureReason AS failureReason
  FROM DocumentRequests`;

export class SqlGenerationRepository {
  async createTemplate(actor, input) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("name", sql.NVarChar(200), input.name)
      .input("type", sql.VarChar(50), input.documentType)
      .input("definition", sql.NVarChar(sql.MAX), JSON.stringify(input.definition))
      .input("actorId", sql.Int, actor.id)
      .query(`INSERT INTO DocumentTemplates
        (IdOrganizacion, Name, DocumentType, Definition, CreatedBy)
        OUTPUT INSERTED.IdDocumentTemplate AS id
        VALUES (@organizationId, @name, @type, @definition, @actorId)`);
    return { id: result.recordset[0].id, ...input, version: 1, active: true };
  }

  async templates(actor, type = null) {
    const pool = await database();
    const request = pool.request().input("organizationId", sql.UniqueIdentifier, actor.organizationId);
    let where = "IdOrganizacion=@organizationId AND Active=1";
    if (type) {
      request.input("type", sql.VarChar(50), type);
      where += " AND DocumentType=@type";
    }
    const result = await request.query(`SELECT IdDocumentTemplate AS id, Name AS name,
      DocumentType AS documentType, Definition AS definition, Version AS version, Active AS active
      FROM DocumentTemplates WHERE ${where} ORDER BY Name`);
    return result.recordset.map((row) => ({ ...row, definition: JSON.parse(row.definition) }));
  }

  async create(actor, input) {
    const pool = await database();
    if (input.templateId) {
      const owned = await pool.request()
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("templateId", sql.UniqueIdentifier, input.templateId)
        .query("SELECT 1 FROM DocumentTemplates WHERE IdOrganizacion=@organizationId AND IdDocumentTemplate=@templateId AND Active=1");
      if (!owned.recordset[0]) return { templateNotFound: true };
    }
    const payload = { ...input, issuedAt: input.issuedAt || new Date().toISOString() };
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("owner", sql.Int, actor.id)
      .input("patientId", sql.UniqueIdentifier, input.patientId)
      .input("title", sql.NVarChar(200), input.title)
      .input("type", sql.VarChar(50), input.documentType)
      .input("templateId", sql.UniqueIdentifier, input.templateId)
      .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(payload))
      .query(`INSERT INTO DocumentRequests
        (IdOrganizacion, IdNutricionista, IdPaciente, Titulo, Estado, Datos,
         DocumentType, TemplateId, Payload, RequestedAt)
        OUTPUT INSERTED.IdDocumentRequest AS id
        VALUES (@organizationId, @owner, @patientId, @title, 'queued', '{}',
                @type, @templateId, @payload, SYSUTCDATETIME())`);
    return this.get(actor, result.recordset[0].id);
  }

  async list(actor, patientId = null) {
    const pool = await database();
    const request = pool.request().input("organizationId", sql.UniqueIdentifier, actor.organizationId);
    let where = "IdOrganizacion=@organizationId AND DocumentType IS NOT NULL";
    if (patientId) {
      request.input("patientId", sql.UniqueIdentifier, patientId);
      where += " AND IdPaciente=@patientId";
    }
    const result = await request.query(`${select} WHERE ${where} ORDER BY RequestedAt DESC`);
    return result.recordset.map(map);
  }

  async get(actor, id) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`${select} WHERE IdOrganizacion=@organizationId AND IdDocumentRequest=@id`);
    return map(result.recordset[0]);
  }

  async claim() {
    const pool = await database();
    const result = await pool.request().query(`UPDATE candidate
      SET Estado='processing', ProcessingStartedAt=SYSUTCDATETIME(),
          FechaActualizacion=SYSUTCDATETIME()
      OUTPUT INSERTED.IdDocumentRequest AS id, INSERTED.IdOrganizacion AS organizationId,
             INSERTED.IdPaciente AS patientId, INSERTED.Titulo AS title,
             INSERTED.DocumentType AS documentType, INSERTED.TemplateId AS templateId,
             INSERTED.Payload AS payload
      FROM (
        SELECT TOP (1) * FROM DocumentRequests WITH (READPAST, UPDLOCK, ROWLOCK)
        WHERE Estado='queued' AND DocumentType IS NOT NULL ORDER BY RequestedAt
      ) candidate`);
    const row = result.recordset[0];
    if (!row) return null;
    let template = null;
    if (row.templateId) {
      const found = await pool.request().input("id", sql.UniqueIdentifier, row.templateId)
        .input("organizationId", sql.UniqueIdentifier, row.organizationId)
        .query("SELECT Definition AS definition FROM DocumentTemplates WHERE IdDocumentTemplate=@id AND IdOrganizacion=@organizationId");
      if (found.recordset[0]) template = { definition: JSON.parse(found.recordset[0].definition) };
    }
    return { ...row, payload: JSON.parse(row.payload), template };
  }

  storagePath(item) {
    return path.join(config.storagePath, String(item.organizationId), `${item.id}.pdf`);
  }

  async complete(item, outputPath) {
    const pool = await database();
    const bytes = await readFile(outputPath);
    const details = await stat(outputPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await pool.request().input("id", sql.UniqueIdentifier, item.id)
      .input("path", sql.NVarChar(1000), outputPath)
      .input("size", sql.BigInt, details.size)
      .input("sha256", sql.Char(64), sha256)
      .query(`UPDATE DocumentRequests SET Estado='completed', StoragePath=@path,
        ContentType='application/pdf', FileSize=@size, Sha256=@sha256,
        CompletedAt=SYSUTCDATETIME(), FechaActualizacion=SYSUTCDATETIME()
        WHERE IdDocumentRequest=@id`);
  }

  async fail(item, error) {
    const pool = await database();
    await pool.request().input("id", sql.UniqueIdentifier, item.id)
      .input("error", sql.NVarChar(1000), String(error?.message || error).slice(0, 1000))
      .query(`UPDATE DocumentRequests SET Estado='failed', FailureReason=@error,
        FechaActualizacion=SYSUTCDATETIME() WHERE IdDocumentRequest=@id`);
  }

  async createAccessToken(actor, id, expiresInMinutes) {
    const pool = await database();
    const document = await this.get(actor, id);
    if (!document) return null;
    if (document.status !== "completed") return { notReady: true };
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60000);
    await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .input("hash", sql.Char(64), tokenHash)
      .input("expiresAt", sql.DateTime2, expiresAt)
      .input("actorId", sql.Int, actor.id)
      .query(`INSERT INTO DocumentAccessTokens
        (IdOrganizacion, IdDocumentRequest, TokenHash, ExpiresAt, CreatedBy)
        VALUES (@organizationId, @id, @hash, @expiresAt, @actorId)`);
    return { token, expiresAt, patientId: document.patientId };
  }

  async resolveToken(token) {
    const pool = await database();
    const hash = createHash("sha256").update(token).digest("hex");
    const result = await pool.request().input("hash", sql.Char(64), hash)
      .query(`SELECT requests.StoragePath AS storagePath, requests.ContentType AS contentType,
                     requests.Titulo AS title, requests.Sha256 AS sha256
              FROM DocumentAccessTokens tokens
              JOIN DocumentRequests requests ON requests.IdDocumentRequest=tokens.IdDocumentRequest
              WHERE tokens.TokenHash=@hash AND tokens.ExpiresAt>SYSUTCDATETIME()
                AND requests.Estado='completed'`);
    return result.recordset[0] || null;
  }
}

import { config } from "../../config.js";
import { database, sql } from "./database.js";

function json(value, fallback = {}) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function mapConsultation(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patientId,
    title: row.title,
    consultationType: row.consultationType,
    status: row.status,
    data: json(row.data),
    version: row.version,
    occurredAt: row.occurredAt,
    publishedAt: row.publishedAt,
    correctionReason: row.correctionReason,
    correctedFromVersion: row.correctedFromVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patientId,
    consultationId: row.consultationId,
    category: row.category,
    title: row.title,
    details: json(row.details),
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    source: row.source,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const consultationSelect = `
  SELECT ${config.idColumn} AS id, IdPaciente AS patientId, Titulo AS title,
         TipoConsulta AS consultationType, Estado AS status, Datos AS data,
         Version AS version, FechaConsulta AS occurredAt, PublicadoEn AS publishedAt,
         MotivoCorreccion AS correctionReason, CorregidoDesdeVersion AS correctedFromVersion,
         FechaCreacion AS createdAt, FechaActualizacion AS updatedAt
  FROM ${config.table}`;

const entrySelect = `
  SELECT IdClinicalEntry AS id, IdPaciente AS patientId, IdConsultation AS consultationId,
         Categoria AS category, Titulo AS title, Detalles AS details, Estado AS status,
         FechaInicio AS startDate, FechaFin AS endDate, Origen AS source,
         Version AS version, FechaCreacion AS createdAt, FechaActualizacion AS updatedAt
  FROM ClinicalEntries`;

export class SqlRecordRepository {
  async auditAccess(actor, event) {
    const pool = await database();
    await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("userId", sql.Int, actor.id)
      .input("role", sql.VarChar(20), actor.organizationRole || null)
      .input("action", sql.VarChar(80), event.action)
      .input("entityType", sql.VarChar(80), event.entityType)
      .input("entityId", sql.NVarChar(100), event.entityId ? String(event.entityId) : null)
      .input("patientId", sql.UniqueIdentifier, event.patientId || null)
      .input("success", sql.Bit, event.success)
      .input("details", sql.NVarChar(sql.MAX), JSON.stringify(event.details || {}))
      .query(`INSERT INTO ClinicalAuditEvents
              (IdOrganizacion, IdUsuario, Rol, Accion, TipoEntidad, IdEntidad, IdPaciente, Exitoso, Detalles)
              VALUES (@organizationId, @userId, @role, @action, @entityType, @entityId, @patientId, @success, @details)`);
  }

  async list(actor, patientId) {
    const pool = await database();
    const request = pool.request().input("organizationId", sql.UniqueIdentifier, actor.organizationId);
    let where = "IdOrganizacion = @organizationId";
    if (patientId) {
      request.input("patientId", sql.UniqueIdentifier, patientId);
      where += " AND IdPaciente = @patientId";
    }
    const result = await request.query(`${consultationSelect} WHERE ${where} ORDER BY FechaConsulta DESC`);
    return result.recordset.map(mapConsultation);
  }

  async get(actor, id) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`${consultationSelect} WHERE IdOrganizacion=@organizationId AND ${config.idColumn}=@id`);
    return mapConsultation(result.recordset[0]);
  }

  async create(actor, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await this.ensureClinicalRecord(transaction, actor, input.patientId);
      const result = await new sql.Request(transaction)
        .input("owner", sql.Int, actor.id)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("title", sql.NVarChar(200), input.title)
        .input("consultationType", sql.VarChar(40), input.consultationType)
        .input("occurredAt", sql.DateTime2, input.occurredAt ? new Date(input.occurredAt) : new Date())
        .input("data", sql.NVarChar(sql.MAX), JSON.stringify(input.data))
        .query(`INSERT INTO ${config.table}
                  (IdOrganizacion, IdNutricionista, IdPaciente, Titulo, TipoConsulta,
                   Estado, Datos, FechaConsulta)
                OUTPUT INSERTED.${config.idColumn} AS id
                VALUES (@organizationId, @owner, @patientId, @title, @consultationType,
                        'draft', @data, @occurredAt)`);
      const id = result.recordset[0].id;
      await this.addEvent(transaction, "clinical.consultation.created.v1", id, actor, {
        patientId: input.patientId,
        consultationType: input.consultationType,
      });
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async update(actor, id, input) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .input("patientId", sql.UniqueIdentifier, input.patientId)
      .input("title", sql.NVarChar(200), input.title)
      .input("consultationType", sql.VarChar(40), input.consultationType)
      .input("occurredAt", sql.DateTime2, input.occurredAt ? new Date(input.occurredAt) : null)
      .input("data", sql.NVarChar(sql.MAX), JSON.stringify(input.data))
      .input("expectedVersion", sql.Int, input.expectedVersion)
      .query(`UPDATE ${config.table}
              SET IdPaciente=@patientId, Titulo=@title, TipoConsulta=@consultationType,
                  FechaConsulta=COALESCE(@occurredAt, FechaConsulta), Datos=@data, Version=Version+1,
                  FechaActualizacion=SYSUTCDATETIME()
              WHERE IdOrganizacion=@organizationId AND ${config.idColumn}=@id
                AND Estado='draft' AND Version=@expectedVersion`);
    if (result.rowsAffected[0]) return this.get(actor, id);
    const current = await this.get(actor, id);
    if (!current) return { error: "not_found" };
    if (current.status !== "draft") return { error: "not_draft" };
    return { error: "version_conflict" };
  }

  async publish(actor, id, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const current = await this.lockConsultation(transaction, actor, id);
      if (!current) return await this.rollbackResult(transaction, "not_found");
      if (current.Version !== input.expectedVersion) {
        return await this.rollbackResult(transaction, "version_conflict");
      }
      if (current.Estado !== "draft") return await this.rollbackResult(transaction, "not_draft");
      const publishedAt = new Date();
      const snapshot = this.snapshot(current, {
        status: "published",
        version: current.Version,
        publishedAt,
      });
      await this.insertVersion(transaction, actor, id, current.Version, snapshot, input.reason, false);
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("id", sql.UniqueIdentifier, id)
        .input("publishedAt", sql.DateTime2, publishedAt)
        .query(`UPDATE ${config.table}
                SET Estado='published', PublicadoEn=@publishedAt,
                    FechaActualizacion=SYSUTCDATETIME()
                WHERE IdOrganizacion=@organizationId AND ${config.idColumn}=@id`);
      await this.addEvent(transaction, "clinical.consultation.published.v1", id, actor, snapshot);
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async correct(actor, id, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const current = await this.lockConsultation(transaction, actor, id);
      if (!current) return await this.rollbackResult(transaction, "not_found");
      if (current.Version !== input.expectedVersion) {
        return await this.rollbackResult(transaction, "version_conflict");
      }
      if (current.Estado !== "published") {
        return await this.rollbackResult(transaction, "not_published");
      }
      const version = current.Version + 1;
      const publishedAt = new Date();
      const snapshot = {
        id,
        patientId: input.patientId,
        title: input.title,
        consultationType: input.consultationType,
        status: "published",
        data: input.data,
        version,
        occurredAt: input.occurredAt || new Date(current.FechaConsulta).toISOString(),
        publishedAt: publishedAt.toISOString(),
      };
      await this.insertVersion(transaction, actor, id, version, snapshot, input.reason, true);
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("id", sql.UniqueIdentifier, id)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("title", sql.NVarChar(200), input.title)
        .input("consultationType", sql.VarChar(40), input.consultationType)
        .input("occurredAt", sql.DateTime2, input.occurredAt ? new Date(input.occurredAt) : current.FechaConsulta)
        .input("data", sql.NVarChar(sql.MAX), JSON.stringify(input.data))
        .input("publishedAt", sql.DateTime2, publishedAt)
        .input("reason", sql.NVarChar(500), input.reason)
        .input("version", sql.Int, version)
        .input("previousVersion", sql.Int, current.Version)
        .query(`UPDATE ${config.table}
                SET IdPaciente=@patientId, Titulo=@title, TipoConsulta=@consultationType,
                    FechaConsulta=@occurredAt, Datos=@data, Version=@version,
                    PublicadoEn=@publishedAt, MotivoCorreccion=@reason,
                    CorregidoDesdeVersion=@previousVersion, FechaActualizacion=SYSUTCDATETIME()
                WHERE IdOrganizacion=@organizationId AND ${config.idColumn}=@id`);
      await this.addEvent(transaction, "clinical.consultation.corrected.v1", id, actor, {
        patientId: input.patientId,
        version,
        previousVersion: current.Version,
        reason: input.reason,
      });
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async versions(actor, id) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT IdConsultationVersion AS id, VersionNumber AS version,
                     Snapshot AS snapshot, ChangeReason AS reason, ChangedBy AS changedBy,
                     IsCorrection AS isCorrection, CreatedAt AS createdAt
              FROM ConsultationVersions
              WHERE IdOrganizacion=@organizationId AND IdConsultation=@id
              ORDER BY VersionNumber`);
    return result.recordset.map((row) => ({ ...row, snapshot: json(row.snapshot) }));
  }

  async clinicalRecord(actor, patientId) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("patientId", sql.UniqueIdentifier, patientId)
      .query(`SELECT IdClinicalRecord AS id, IdPaciente AS patientId,
                     CreadoPor AS createdBy, FechaCreacion AS createdAt,
                     FechaActualizacion AS updatedAt
              FROM ClinicalRecords
              WHERE IdOrganizacion=@organizationId AND IdPaciente=@patientId`);
    return result.recordset[0] || null;
  }

  async timeline(actor, patientId) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("patientId", sql.UniqueIdentifier, patientId)
      .query(`SELECT occurredAt, eventType, entityId, title, details
              FROM (
                SELECT versions.CreatedAt AS occurredAt,
                       CASE WHEN versions.IsCorrection=1 THEN 'consultation_corrected'
                            ELSE 'consultation_published' END AS eventType,
                       versions.IdConsultationVersion AS entityId,
                       consultations.Titulo AS title, versions.Snapshot AS details
                FROM ConsultationVersions versions
                JOIN Consultations consultations
                  ON consultations.IdConsultation=versions.IdConsultation
                WHERE versions.IdOrganizacion=@organizationId
                  AND consultations.IdPaciente=@patientId
                UNION ALL
                SELECT FechaActualizacion, CONCAT('clinical_', Categoria), IdClinicalEntry,
                       Titulo, Detalles
                FROM ClinicalEntries
                WHERE IdOrganizacion=@organizationId AND IdPaciente=@patientId
                UNION ALL
                SELECT FechaCreacion, 'nutrition_diagnosis', IdNutritionDiagnosis,
                       Enunciado,
                       (SELECT Codigo AS code, Etiologia AS etiology, Signos AS signs,
                               Estado AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
                FROM NutritionDiagnoses
                WHERE IdOrganizacion=@organizationId AND IdPaciente=@patientId
                UNION ALL
                SELECT FechaCreacion, 'clinical_goal', IdClinicalGoal, Titulo,
                       (SELECT Descripcion AS description, ValorObjetivo AS targetValue,
                               Unidad AS unit, FechaObjetivo AS dueDate, Estado AS status
                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
                FROM ClinicalGoals
                WHERE IdOrganizacion=@organizationId AND IdPaciente=@patientId
                UNION ALL
                SELECT FechaCreacion, 'follow_up', IdFollowUp, Resumen,
                       (SELECT Adherencia AS adherence, Dificultades AS difficulties,
                               ProximosPasos AS nextSteps, FechaSeguimiento AS scheduledAt
                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
                FROM FollowUps
                WHERE IdOrganizacion=@organizationId AND IdPaciente=@patientId
              ) timeline
              ORDER BY occurredAt DESC`);
    return result.recordset.map((row) => ({ ...row, details: json(row.details) }));
  }

  async listEntries(actor, patientId, category) {
    const pool = await database();
    const request = pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("patientId", sql.UniqueIdentifier, patientId);
    let filter = "";
    if (category) {
      request.input("category", sql.VarChar(40), category);
      filter = " AND Categoria=@category";
    }
    const result = await request.query(`${entrySelect}
      WHERE IdOrganizacion=@organizationId AND IdPaciente=@patientId${filter}
      ORDER BY FechaActualizacion DESC`);
    return result.recordset.map(mapEntry);
  }

  async createEntry(actor, patientId, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const recordId = await this.ensureClinicalRecord(transaction, actor, patientId);
      if (input.consultationId) {
        const consultation = await new sql.Request(transaction)
          .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
          .input("patientId", sql.UniqueIdentifier, patientId)
          .input("consultationId", sql.UniqueIdentifier, input.consultationId)
          .query(`SELECT 1 AS found FROM Consultations
                  WHERE IdOrganizacion=@organizationId AND IdPaciente=@patientId
                    AND IdConsultation=@consultationId`);
        if (!consultation.recordset[0]) return await this.rollbackResult(transaction, "not_found");
      }
      const result = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("recordId", sql.UniqueIdentifier, recordId)
        .input("patientId", sql.UniqueIdentifier, patientId)
        .input("consultationId", sql.UniqueIdentifier, input.consultationId)
        .input("category", sql.VarChar(40), input.category)
        .input("title", sql.NVarChar(240), input.title)
        .input("details", sql.NVarChar(sql.MAX), JSON.stringify(input.details))
        .input("status", sql.VarChar(30), input.status)
        .input("startDate", sql.DateTime2, input.startDate ? new Date(input.startDate) : null)
        .input("endDate", sql.DateTime2, input.endDate ? new Date(input.endDate) : null)
        .input("source", sql.NVarChar(120), input.source)
        .input("owner", sql.Int, actor.id)
        .query(`INSERT INTO ClinicalEntries
                  (IdOrganizacion, IdClinicalRecord, IdPaciente, IdConsultation, Categoria,
                   Titulo, Detalles, Estado, FechaInicio, FechaFin, Origen, CreadoPor)
                OUTPUT INSERTED.IdClinicalEntry AS id
                VALUES (@organizationId, @recordId, @patientId, @consultationId, @category,
                        @title, @details, @status, @startDate, @endDate, @source, @owner)`);
      const id = result.recordset[0].id;
      await this.addEvent(transaction, "clinical.entry.changed.v1", id, actor, {
        patientId,
        category: input.category,
        action: "created",
      });
      await transaction.commit();
      return this.getEntry(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async updateEntry(actor, id, input) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .input("consultationId", sql.UniqueIdentifier, input.consultationId)
      .input("category", sql.VarChar(40), input.category)
      .input("title", sql.NVarChar(240), input.title)
      .input("details", sql.NVarChar(sql.MAX), JSON.stringify(input.details))
      .input("status", sql.VarChar(30), input.status)
      .input("startDate", sql.DateTime2, input.startDate ? new Date(input.startDate) : null)
      .input("endDate", sql.DateTime2, input.endDate ? new Date(input.endDate) : null)
      .input("source", sql.NVarChar(120), input.source)
      .input("expectedVersion", sql.Int, input.expectedVersion)
      .query(`UPDATE ClinicalEntries
              SET IdConsultation=@consultationId, Categoria=@category, Titulo=@title,
                  Detalles=@details, Estado=@status, FechaInicio=@startDate,
                  FechaFin=@endDate, Origen=@source, Version=Version+1,
                  FechaActualizacion=SYSUTCDATETIME()
              WHERE IdOrganizacion=@organizationId AND IdClinicalEntry=@id
                AND Version=@expectedVersion`);
    if (result.rowsAffected[0]) return this.getEntry(actor, id);
    return (await this.getEntry(actor, id)) ? { error: "version_conflict" } : { error: "not_found" };
  }

  async archiveEntry(actor, id) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`UPDATE ClinicalEntries
              SET Estado='inactive', Version=Version+1, FechaActualizacion=SYSUTCDATETIME()
              WHERE IdOrganizacion=@organizationId AND IdClinicalEntry=@id`);
    return result.rowsAffected[0] ? this.getEntry(actor, id) : { error: "not_found" };
  }

  async getEntry(actor, id) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`${entrySelect} WHERE IdOrganizacion=@organizationId AND IdClinicalEntry=@id`);
    return mapEntry(result.recordset[0]);
  }

  listDiagnoses(actor, consultationId) {
    return this.listRelated(actor, consultationId, "diagnosis");
  }

  createDiagnosis(actor, consultationId, input) {
    return this.createRelated(actor, consultationId, "diagnosis", input);
  }

  listGoals(actor, consultationId) {
    return this.listRelated(actor, consultationId, "goal");
  }

  createGoal(actor, consultationId, input) {
    return this.createRelated(actor, consultationId, "goal", input);
  }

  listFollowUps(actor, consultationId) {
    return this.listRelated(actor, consultationId, "followUp");
  }

  createFollowUp(actor, consultationId, input) {
    return this.createRelated(actor, consultationId, "followUp", input);
  }

  async listRelated(actor, consultationId, kind) {
    const definitions = {
      diagnosis: {
        query: `SELECT IdNutritionDiagnosis AS id, Codigo AS code, Enunciado AS statement,
                       Etiologia AS etiology, Signos AS signs, Estado AS status,
                       FechaCreacion AS createdAt FROM NutritionDiagnoses`,
      },
      goal: {
        query: `SELECT IdClinicalGoal AS id, Titulo AS title, Descripcion AS description,
                       ValorObjetivo AS targetValue, Unidad AS unit, FechaObjetivo AS dueDate,
                       Estado AS status, FechaCreacion AS createdAt,
                       FechaActualizacion AS updatedAt FROM ClinicalGoals`,
      },
      followUp: {
        query: `SELECT IdFollowUp AS id, Resumen AS summary, Adherencia AS adherence,
                       Dificultades AS difficulties, ProximosPasos AS nextSteps,
                       FechaSeguimiento AS scheduledAt, FechaCreacion AS createdAt FROM FollowUps`,
      },
    };
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("consultationId", sql.UniqueIdentifier, consultationId)
      .query(`${definitions[kind].query}
              WHERE IdOrganizacion=@organizationId AND IdConsultation=@consultationId
              ORDER BY FechaCreacion`);
    return result.recordset;
  }

  async createRelated(actor, consultationId, kind, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const consultation = await this.lockConsultation(transaction, actor, consultationId);
      if (!consultation) return await this.rollbackResult(transaction, "not_found");
      let result;
      if (kind === "diagnosis") {
        result = await new sql.Request(transaction)
          .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
          .input("consultationId", sql.UniqueIdentifier, consultationId)
          .input("patientId", sql.UniqueIdentifier, consultation.IdPaciente)
          .input("code", sql.NVarChar(60), input.code)
          .input("statement", sql.NVarChar(500), input.statement)
          .input("etiology", sql.NVarChar(1000), input.etiology)
          .input("signs", sql.NVarChar(1000), input.signs)
          .input("status", sql.VarChar(30), input.status)
          .input("owner", sql.Int, actor.id)
          .query(`INSERT INTO NutritionDiagnoses
                    (IdOrganizacion, IdConsultation, IdPaciente, Codigo, Enunciado,
                     Etiologia, Signos, Estado, CreadoPor)
                  OUTPUT INSERTED.IdNutritionDiagnosis AS id
                  VALUES (@organizationId, @consultationId, @patientId, @code, @statement,
                          @etiology, @signs, @status, @owner)`);
      } else if (kind === "goal") {
        result = await new sql.Request(transaction)
          .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
          .input("consultationId", sql.UniqueIdentifier, consultationId)
          .input("patientId", sql.UniqueIdentifier, consultation.IdPaciente)
          .input("title", sql.NVarChar(240), input.title)
          .input("description", sql.NVarChar(1000), input.description)
          .input("targetValue", sql.Decimal(18, 4), input.targetValue)
          .input("unit", sql.NVarChar(40), input.unit)
          .input("dueDate", sql.DateTime2, input.dueDate ? new Date(input.dueDate) : null)
          .input("status", sql.VarChar(30), input.status)
          .input("owner", sql.Int, actor.id)
          .query(`INSERT INTO ClinicalGoals
                    (IdOrganizacion, IdConsultation, IdPaciente, Titulo, Descripcion,
                     ValorObjetivo, Unidad, FechaObjetivo, Estado, CreadoPor)
                  OUTPUT INSERTED.IdClinicalGoal AS id
                  VALUES (@organizationId, @consultationId, @patientId, @title, @description,
                          @targetValue, @unit, @dueDate, @status, @owner)`);
      } else {
        result = await new sql.Request(transaction)
          .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
          .input("consultationId", sql.UniqueIdentifier, consultationId)
          .input("patientId", sql.UniqueIdentifier, consultation.IdPaciente)
          .input("summary", sql.NVarChar(1000), input.summary)
          .input("adherence", sql.Decimal(5, 2), input.adherence)
          .input("difficulties", sql.NVarChar(1000), input.difficulties)
          .input("nextSteps", sql.NVarChar(1000), input.nextSteps)
          .input("scheduledAt", sql.DateTime2, input.scheduledAt ? new Date(input.scheduledAt) : null)
          .input("owner", sql.Int, actor.id)
          .query(`INSERT INTO FollowUps
                    (IdOrganizacion, IdConsultation, IdPaciente, Resumen, Adherencia,
                     Dificultades, ProximosPasos, FechaSeguimiento, CreadoPor)
                  OUTPUT INSERTED.IdFollowUp AS id
                  VALUES (@organizationId, @consultationId, @patientId, @summary, @adherence,
                          @difficulties, @nextSteps, @scheduledAt, @owner)`);
      }
      const id = result.recordset[0].id;
      await this.addEvent(transaction, `clinical.${kind}.created.v1`, consultationId, actor, {
        id,
        patientId: consultation.IdPaciente,
      });
      await transaction.commit();
      const rows = await this.listRelated(actor, consultationId, kind);
      return rows.find((item) => String(item.id) === String(id));
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async importLegacyHistory(actor, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const exists = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("legacyHistoryId", sql.NVarChar(100), input.legacyHistoryId)
        .input("source", sql.NVarChar(120), input.source)
        .query(`SELECT IdLegacyHistoryImport AS id FROM LegacyHistoryImports
                WHERE IdOrganizacion=@organizationId AND LegacyHistoryId=@legacyHistoryId
                  AND Origen=@source`);
      if (exists.recordset[0]) {
        await transaction.rollback();
        return { imported: false, id: exists.recordset[0].id };
      }
      const recordId = await this.ensureClinicalRecord(transaction, actor, input.patientId);
      const imported = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("legacyHistoryId", sql.NVarChar(100), input.legacyHistoryId)
        .input("type", sql.NVarChar(120), input.type)
        .input("notes", sql.NVarChar(sql.MAX), input.notes)
        .input("recordedAt", sql.DateTime2, input.recordedAt ? new Date(input.recordedAt) : null)
        .input("source", sql.NVarChar(120), input.source)
        .query(`INSERT INTO LegacyHistoryImports
                  (IdOrganizacion, IdPaciente, LegacyHistoryId, Tipo, Notas, FechaOrigen, Origen)
                OUTPUT INSERTED.IdLegacyHistoryImport AS id
                VALUES (@organizationId, @patientId, @legacyHistoryId, @type, @notes,
                        @recordedAt, @source)`);
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("recordId", sql.UniqueIdentifier, recordId)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("title", sql.NVarChar(240), input.type || "Historia clínica migrada")
        .input("details", sql.NVarChar(sql.MAX), JSON.stringify({
          notes: input.notes,
          legacyHistoryId: input.legacyHistoryId,
          recordedAt: input.recordedAt,
        }))
        .input("recordedAt", sql.DateTime2, input.recordedAt ? new Date(input.recordedAt) : null)
        .input("source", sql.NVarChar(120), input.source)
        .input("owner", sql.Int, actor.id)
        .query(`INSERT INTO ClinicalEntries
                  (IdOrganizacion, IdClinicalRecord, IdPaciente, Categoria, Titulo,
                   Detalles, Estado, FechaInicio, Origen, CreadoPor)
                VALUES (@organizationId, @recordId, @patientId, 'clinical_note', @title,
                        @details, 'active', @recordedAt, @source, @owner)`);
      await this.addEvent(transaction, "clinical.legacy-history.imported.v1", input.patientId, actor, {
        legacyHistoryId: input.legacyHistoryId,
        source: input.source,
      });
      await transaction.commit();
      return { imported: true, id: imported.recordset[0].id };
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async ensureClinicalRecord(transaction, actor, patientId) {
    const result = await new sql.Request(transaction)
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("patientId", sql.UniqueIdentifier, patientId)
      .input("owner", sql.Int, actor.id)
      .query(`DECLARE @id UNIQUEIDENTIFIER;
              SELECT @id=IdClinicalRecord FROM ClinicalRecords WITH (UPDLOCK, HOLDLOCK)
              WHERE IdOrganizacion=@organizationId AND IdPaciente=@patientId;
              IF @id IS NULL
              BEGIN
                SET @id=NEWID();
                INSERT INTO ClinicalRecords
                  (IdClinicalRecord, IdOrganizacion, IdPaciente, CreadoPor)
                VALUES (@id, @organizationId, @patientId, @owner);
              END;
              SELECT @id AS id;`);
    return result.recordset[0].id;
  }

  async lockConsultation(transaction, actor, id) {
    const result = await new sql.Request(transaction)
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT * FROM ${config.table} WITH (UPDLOCK, HOLDLOCK)
              WHERE IdOrganizacion=@organizationId AND ${config.idColumn}=@id`);
    return result.recordset[0] || null;
  }

  snapshot(row, overrides = {}) {
    return {
      id: row.IdConsultation,
      patientId: row.IdPaciente,
      title: row.Titulo,
      consultationType: row.TipoConsulta,
      status: row.Estado,
      data: json(row.Datos),
      version: row.Version,
      occurredAt: row.FechaConsulta,
      publishedAt: row.PublicadoEn,
      ...overrides,
    };
  }

  async insertVersion(transaction, actor, id, version, snapshot, reason, isCorrection) {
    await new sql.Request(transaction)
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .input("version", sql.Int, version)
      .input("snapshot", sql.NVarChar(sql.MAX), JSON.stringify(snapshot))
      .input("reason", sql.NVarChar(500), reason)
      .input("owner", sql.Int, actor.id)
      .input("isCorrection", sql.Bit, isCorrection)
      .query(`INSERT INTO ConsultationVersions
                (IdOrganizacion, IdConsultation, VersionNumber, Snapshot,
                 ChangeReason, ChangedBy, IsCorrection)
              VALUES (@organizationId, @id, @version, @snapshot,
                      @reason, @owner, @isCorrection)`);
  }

  async rollbackResult(transaction, error) {
    await transaction.rollback();
    return { error };
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

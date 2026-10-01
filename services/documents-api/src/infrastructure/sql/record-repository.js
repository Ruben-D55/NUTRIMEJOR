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

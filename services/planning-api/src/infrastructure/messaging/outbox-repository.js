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

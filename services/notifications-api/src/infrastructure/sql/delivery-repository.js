import { database, sql } from "./database.js";

function job(row) {
  return row && {
    id: row.id,
    patientId: row.patientId,
    title: row.title,
    status: row.status,
    templateCode: row.templateCode,
    channel: row.channel,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    scheduledAt: row.scheduledAt,
    nextAttemptAt: row.nextAttemptAt,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    deliveredAt: row.deliveredAt,
    lastError: row.lastError,
  };
}

const jobSelect = `SELECT IdNotification AS id, IdPaciente AS patientId, Titulo AS title,
  Estado AS status, TemplateCode AS templateCode, Channel AS channel, Recipient AS recipient,
  Subject AS subject, Body AS body, ScheduledAt AS scheduledAt, NextAttemptAt AS nextAttemptAt,
  AttemptCount AS attemptCount, MaxAttempts AS maxAttempts, DeliveredAt AS deliveredAt,
  LastError AS lastError FROM NotificationJobs`;

export class SqlDeliveryRepository {
  async createAlertRule(actor, input) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("name", sql.NVarChar(200), input.name)
      .input("ruleType", sql.VarChar(50), input.ruleType)
      .input("conditions", sql.NVarChar(sql.MAX), JSON.stringify(input.conditions))
      .input("channels", sql.NVarChar(sql.MAX), JSON.stringify(input.channels))
      .input("leadMinutes", sql.Int, input.leadMinutes)
      .input("enabled", sql.Bit, input.enabled)
      .input("actorId", sql.Int, actor.id)
      .query(`INSERT INTO AlertRules
        (IdOrganizacion, Name, RuleType, Conditions, Channels, LeadMinutes,
         Enabled, CreatedBy, UpdatedBy)
        OUTPUT INSERTED.IdAlertRule AS id
        VALUES (@organizationId, @name, @ruleType, @conditions, @channels,
                @leadMinutes, @enabled, @actorId, @actorId)`);
    return this.getAlertRule(actor, result.recordset[0].id);
  }

  async getAlertRule(actor, id) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT IdAlertRule AS id, Name AS name, RuleType AS ruleType,
                     Conditions AS conditions, Channels AS channels,
                     LeadMinutes AS leadMinutes, Enabled AS enabled,
                     CreatedAt AS createdAt, UpdatedAt AS updatedAt
              FROM AlertRules WHERE IdOrganizacion=@organizationId AND IdAlertRule=@id`);
    const row = result.recordset[0];
    return row ? { ...row, conditions: JSON.parse(row.conditions), channels: JSON.parse(row.channels) } : null;
  }

  async alertRules(actor) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .query(`SELECT IdAlertRule AS id, Name AS name, RuleType AS ruleType,
                     Conditions AS conditions, Channels AS channels,
                     LeadMinutes AS leadMinutes, Enabled AS enabled,
                     CreatedAt AS createdAt, UpdatedAt AS updatedAt
              FROM AlertRules WHERE IdOrganizacion=@organizationId ORDER BY Name`);
    return result.recordset.map((row) => ({
      ...row,
      conditions: JSON.parse(row.conditions),
      channels: JSON.parse(row.channels),
    }));
  }

  async updateAlertRule(actor, id, input) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .input("name", sql.NVarChar(200), input.name)
      .input("ruleType", sql.VarChar(50), input.ruleType)
      .input("conditions", sql.NVarChar(sql.MAX), JSON.stringify(input.conditions))
      .input("channels", sql.NVarChar(sql.MAX), JSON.stringify(input.channels))
      .input("leadMinutes", sql.Int, input.leadMinutes)
      .input("enabled", sql.Bit, input.enabled)
      .input("actorId", sql.Int, actor.id)
      .query(`UPDATE AlertRules SET Name=@name, RuleType=@ruleType,
                     Conditions=@conditions, Channels=@channels,
                     LeadMinutes=@leadMinutes, Enabled=@enabled,
                     UpdatedBy=@actorId, UpdatedAt=SYSUTCDATETIME()
              WHERE IdOrganizacion=@organizationId AND IdAlertRule=@id;
              SELECT @@ROWCOUNT AS affected`);
    return result.recordset[0].affected ? this.getAlertRule(actor, id) : null;
  }

  async setPreference(actor, input) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("patientId", sql.UniqueIdentifier, input.patientId)
      .input("channel", sql.VarChar(30), input.channel)
      .input("recipient", sql.NVarChar(320), input.recipient)
      .input("enabled", sql.Bit, input.enabled)
      .input("minutes", sql.Int, input.reminderMinutes)
      .input("actorId", sql.Int, actor.id)
      .query(`MERGE NotificationPreferences AS target
        USING (SELECT @organizationId AS IdOrganizacion, @patientId AS IdPaciente,
                      @channel AS Channel) AS source
        ON target.IdOrganizacion=source.IdOrganizacion AND target.IdPaciente=source.IdPaciente
           AND target.Channel=source.Channel
        WHEN MATCHED THEN UPDATE SET Recipient=@recipient, Enabled=@enabled,
          ReminderMinutes=@minutes, UpdatedBy=@actorId, UpdatedAt=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT
          (IdOrganizacion, IdPaciente, Channel, Recipient, Enabled, ReminderMinutes, UpdatedBy)
          VALUES (@organizationId, @patientId, @channel, @recipient, @enabled, @minutes, @actorId);
        SELECT IdNotificationPreference AS id, IdPaciente AS patientId, Channel AS channel,
               Recipient AS recipient, Enabled AS enabled, ReminderMinutes AS reminderMinutes
        FROM NotificationPreferences
        WHERE IdOrganizacion=@organizationId AND IdPaciente=@patientId AND Channel=@channel`);
    return result.recordset[0];
  }

  async preferences(actor, patientId) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("patientId", sql.UniqueIdentifier, patientId)
      .query(`SELECT IdNotificationPreference AS id, IdPaciente AS patientId,
                     Channel AS channel, Recipient AS recipient, Enabled AS enabled,
                     ReminderMinutes AS reminderMinutes
              FROM NotificationPreferences
              WHERE IdOrganizacion=@organizationId AND IdPaciente=@patientId ORDER BY Channel`);
    return result.recordset;
  }

  async create(actor, input) {
    const pool = await database();
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("owner", sql.Int, actor.id)
      .input("patientId", sql.UniqueIdentifier, input.patientId)
      .input("title", sql.NVarChar(200), input.title)
      .input("template", sql.VarChar(80), input.templateCode)
      .input("channel", sql.VarChar(30), input.channel)
      .input("recipient", sql.NVarChar(320), input.recipient)
      .input("subject", sql.NVarChar(300), input.subject)
      .input("body", sql.NVarChar(sql.MAX), input.body)
      .input("scheduledAt", sql.DateTime2, scheduledAt)
      .input("maxAttempts", sql.SmallInt, input.maxAttempts)
      .query(`INSERT INTO NotificationJobs
        (IdOrganizacion, IdNutricionista, IdPaciente, Titulo, Estado, Datos,
         TemplateCode, Channel, Recipient, Subject, Body, ScheduledAt, NextAttemptAt, MaxAttempts)
        OUTPUT INSERTED.IdNotification AS id
        VALUES
        (@organizationId, @owner, @patientId, @title, 'queued', '{}',
         @template, @channel, @recipient, @subject, @body, @scheduledAt, @scheduledAt, @maxAttempts)`);
    return this.get(actor, result.recordset[0].id);
  }

  async get(actor, id) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`${jobSelect} WHERE IdOrganizacion=@organizationId AND IdNotification=@id`);
    return job(result.recordset[0]);
  }

  async list(actor, patientId = null) {
    const pool = await database();
    const request = pool.request().input("organizationId", sql.UniqueIdentifier, actor.organizationId);
    let where = "IdOrganizacion=@organizationId";
    if (patientId) {
      request.input("patientId", sql.UniqueIdentifier, patientId);
      where += " AND IdPaciente=@patientId";
    }
    const result = await request.query(`${jobSelect} WHERE ${where} ORDER BY FechaCreacion DESC`);
    return result.recordset.map(job);
  }

  async processEvent(event) {
    if (!event?.eventId || !event?.organizationId || !event?.aggregateId) throw new Error("Evento inválido.");
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const inbox = await new sql.Request(transaction)
        .input("eventId", sql.UniqueIdentifier, event.eventId)
        .input("eventType", sql.NVarChar(160), event.eventType)
        .input("organizationId", sql.UniqueIdentifier, event.organizationId)
        .input("aggregateId", sql.UniqueIdentifier, event.aggregateId)
        .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(event))
        .query(`IF NOT EXISTS (SELECT 1 FROM NotificationInbox WITH (UPDLOCK, HOLDLOCK) WHERE EventId=@eventId)
          BEGIN
            INSERT INTO NotificationInbox (EventId, EventType, IdOrganizacion, AggregateId, Payload)
            VALUES (@eventId, @eventType, @organizationId, @aggregateId, @payload);
            SELECT CAST(1 AS BIT) AS inserted;
          END ELSE SELECT CAST(0 AS BIT) AS inserted;`);
      if (!inbox.recordset[0].inserted) {
        await transaction.rollback();
        return false;
      }
      const patientId = event.data?.patientId;
      if (patientId && event.eventType === "scheduling.appointment.scheduled.v1") {
        const startsAt = new Date(event.data.startsAt);
        await new sql.Request(transaction)
          .input("eventId", sql.UniqueIdentifier, event.eventId)
          .input("organizationId", sql.UniqueIdentifier, event.organizationId)
          .input("patientId", sql.UniqueIdentifier, patientId)
          .input("aggregateId", sql.UniqueIdentifier, event.aggregateId)
          .input("startsAt", sql.DateTime2, startsAt)
          .query(`INSERT INTO NotificationJobs
            (IdOrganizacion, IdNutricionista, IdPaciente, Titulo, Estado, Datos,
             SourceEventId, TemplateCode, Channel, Recipient, Subject, Body,
             ScheduledAt, NextAttemptAt, MaxAttempts)
            SELECT @organizationId, 0, @patientId, N'Recordatorio de cita', 'queued', '{}',
                   @eventId, 'APPOINTMENT_REMINDER', preferences.Channel, preferences.Recipient,
                   N'Recordatorio de cita',
                   CONCAT(N'Tiene una cita programada para ', CONVERT(nvarchar(30), @startsAt, 126)),
                   DATEADD(minute, -preferences.ReminderMinutes, @startsAt),
                   DATEADD(minute, -preferences.ReminderMinutes, @startsAt), 3
            FROM NotificationPreferences preferences
            WHERE preferences.IdOrganizacion=@organizationId AND preferences.IdPaciente=@patientId
              AND preferences.Enabled=1;`);
      }
      await transaction.commit();
      return true;
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async pending(limit = 20) {
    const pool = await database();
    const result = await pool.request().input("limit", sql.Int, limit)
      .query(`SELECT TOP (@limit) IdNotification AS id, Channel AS channel,
                     Recipient AS recipient, Subject AS subject, Body AS body,
                     AttemptCount AS attemptCount, MaxAttempts AS maxAttempts
              FROM NotificationJobs WITH (READPAST, UPDLOCK)
              WHERE Estado='queued' AND NextAttemptAt<=SYSUTCDATETIME()
              ORDER BY NextAttemptAt, FechaCreacion`);
    return result.recordset;
  }

  async markDelivered(item, providerMessageId) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).input("id", sql.UniqueIdentifier, item.id)
        .input("attempt", sql.SmallInt, item.attemptCount + 1)
        .input("providerId", sql.NVarChar(200), providerMessageId)
        .query(`INSERT INTO NotificationDeliveryAttempts
          (IdNotification, AttemptNumber, FinishedAt, Status, ProviderMessageId)
          VALUES (@id, @attempt, SYSUTCDATETIME(), 'delivered', @providerId);
          UPDATE NotificationJobs SET Estado='delivered', AttemptCount=@attempt,
            DeliveredAt=SYSUTCDATETIME(), LastError=NULL, FechaActualizacion=SYSUTCDATETIME()
          WHERE IdNotification=@id`);
      await transaction.commit();
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async markFailed(item, error) {
    const pool = await database();
    const attempt = item.attemptCount + 1;
    const terminal = attempt >= item.maxAttempts;
    const delaySeconds = Math.min(60, 2 ** attempt);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).input("id", sql.UniqueIdentifier, item.id)
        .input("attempt", sql.SmallInt, attempt)
        .input("error", sql.NVarChar(1000), String(error?.message || error).slice(0, 1000))
        .input("delay", sql.Int, delaySeconds)
        .input("terminal", sql.Bit, terminal)
        .query(`INSERT INTO NotificationDeliveryAttempts
          (IdNotification, AttemptNumber, FinishedAt, Status, ErrorMessage)
          VALUES (@id, @attempt, SYSUTCDATETIME(), 'failed', @error);
          UPDATE NotificationJobs SET Estado=CASE WHEN @terminal=1 THEN 'dead_letter' ELSE 'queued' END,
            AttemptCount=@attempt, NextAttemptAt=DATEADD(second,@delay,SYSUTCDATETIME()),
            LastError=@error, FechaActualizacion=SYSUTCDATETIME()
          WHERE IdNotification=@id;
          IF @terminal=1
            INSERT INTO NotificationDeadLetters (IdNotification, Reason, Snapshot)
            SELECT IdNotification, @error,
                   (SELECT IdNotification AS id, Channel AS channel, Recipient AS recipient,
                           Body AS body, AttemptCount AS attempts FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
            FROM NotificationJobs WHERE IdNotification=@id;`);
      await transaction.commit();
    } catch (failure) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw failure;
    }
  }
}

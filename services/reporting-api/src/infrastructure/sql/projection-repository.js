import { database, sql } from "./database.js";

function patientIdFor(event) {
  if (event.data?.patientId) return event.data.patientId;
  return event.eventType?.startsWith("patients.") ? event.aggregateId : null;
}

function eventSummary(event) {
  return event.eventType.split(".").join(" ").slice(0, 300);
}

export class SqlProjectionRepository {
  async processEvent(event, messageId = null) {
    if (!event?.eventId || !event?.eventType || !event?.organizationId || !event?.aggregateId) {
      throw new Error("Evento sin sobre canónico.");
    }
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const patientId = patientIdFor(event);
      const domain = event.eventType.split(".")[0].slice(0, 60);
      const occurredAt = new Date(event.occurredAt || Date.now());
      const request = new sql.Request(transaction)
        .input("eventId", sql.UniqueIdentifier, event.eventId)
        .input("messageId", sql.NVarChar(200), messageId)
        .input("eventType", sql.NVarChar(160), event.eventType)
        .input("organizationId", sql.UniqueIdentifier, event.organizationId)
        .input("patientId", sql.UniqueIdentifier, patientId)
        .input("aggregateId", sql.UniqueIdentifier, event.aggregateId)
        .input("domain", sql.VarChar(60), domain)
        .input("occurredAt", sql.DateTime2, occurredAt)
        .input("summary", sql.NVarChar(300), eventSummary(event))
        .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(event));
      const inserted = await request.query(`
        IF NOT EXISTS (SELECT 1 FROM InboxMessages WITH (UPDLOCK, HOLDLOCK) WHERE EventId=@eventId)
        BEGIN
          INSERT INTO InboxMessages
            (EventId, MessageId, EventType, IdOrganizacion, IdPaciente, AggregateId,
             DomainName, OccurredAt, Payload)
          VALUES
            (@eventId, @messageId, @eventType, @organizationId, @patientId, @aggregateId,
             @domain, @occurredAt, @payload);

          MERGE OrganizationDailyMetrics AS target
          USING (SELECT @organizationId AS IdOrganizacion, CAST(@occurredAt AS DATE) AS MetricDate,
                        @domain AS DomainName, @eventType AS EventType) AS source
          ON target.IdOrganizacion=source.IdOrganizacion AND target.MetricDate=source.MetricDate
             AND target.DomainName=source.DomainName AND target.EventType=source.EventType
          WHEN MATCHED THEN UPDATE SET EventCount=target.EventCount+1, LastEventAt=@occurredAt
          WHEN NOT MATCHED THEN INSERT
            (IdOrganizacion, MetricDate, DomainName, EventType, EventCount, LastEventAt)
            VALUES (@organizationId, CAST(@occurredAt AS DATE), @domain, @eventType, 1, @occurredAt);

          IF @patientId IS NOT NULL
          BEGIN
            INSERT INTO PatientActivity
              (EventId, IdOrganizacion, IdPaciente, DomainName, EventType, AggregateId,
               OccurredAt, Summary, Details)
            VALUES
              (@eventId, @organizationId, @patientId, @domain, @eventType, @aggregateId,
               @occurredAt, @summary, @payload);

            MERGE PatientDomainState AS target
            USING (SELECT @organizationId AS IdOrganizacion, @patientId AS IdPaciente,
                          @domain AS DomainName) AS source
            ON target.IdOrganizacion=source.IdOrganizacion AND target.IdPaciente=source.IdPaciente
               AND target.DomainName=source.DomainName
            WHEN MATCHED THEN UPDATE SET EventCount=target.EventCount+1,
              LastEventType=@eventType, LastAggregateId=@aggregateId, LastEventAt=@occurredAt
            WHEN NOT MATCHED THEN INSERT
              (IdOrganizacion, IdPaciente, DomainName, EventCount, LastEventType,
               LastAggregateId, LastEventAt)
              VALUES (@organizationId, @patientId, @domain, 1, @eventType, @aggregateId, @occurredAt);
          END;
          SELECT CAST(1 AS BIT) AS inserted;
        END
        ELSE SELECT CAST(0 AS BIT) AS inserted;`);
      await transaction.commit();
      return Boolean(inserted.recordset[0]?.inserted);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async organizationDashboard(actor, from, to) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("from", sql.Date, from)
      .input("to", sql.Date, to)
      .query(`SELECT MetricDate AS metricDate, DomainName AS domain,
                     EventType AS eventType, EventCount AS eventCount, LastEventAt AS lastEventAt
              FROM OrganizationDailyMetrics
              WHERE IdOrganizacion=@organizationId AND MetricDate BETWEEN @from AND @to
              ORDER BY MetricDate, DomainName, EventType`);
    return { from, to, series: result.recordset };
  }

  async patientDashboard(actor, patientId) {
    const pool = await database();
    const request = pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("patientId", sql.UniqueIdentifier, patientId);
    const [states, activity] = await Promise.all([
      request.query(`SELECT DomainName AS domain, EventCount AS eventCount,
                            LastEventType AS lastEventType, LastAggregateId AS lastAggregateId,
                            LastEventAt AS lastEventAt
                     FROM PatientDomainState
                     WHERE IdOrganizacion=@organizationId AND IdPaciente=@patientId
                     ORDER BY DomainName`),
      pool.request().input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("patientId", sql.UniqueIdentifier, patientId)
        .query(`SELECT TOP (200) EventId AS eventId, DomainName AS domain,
                              EventType AS eventType, AggregateId AS aggregateId,
                              OccurredAt AS occurredAt, Summary AS summary, Details AS details
                       FROM PatientActivity
                       WHERE IdOrganizacion=@organizationId AND IdPaciente=@patientId
                       ORDER BY OccurredAt DESC`),
    ]);
    return {
      patientId,
      domains: states.recordset,
      timeline: activity.recordset.map((row) => ({ ...row, details: JSON.parse(row.details) })),
    };
  }

  async rebuild(actor) {
    if (!["OWNER", "ADMIN"].includes(actor.organizationRole)) return { forbidden: true };
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .query(`
          DELETE FROM PatientActivity WHERE IdOrganizacion=@organizationId;
          DELETE FROM PatientDomainState WHERE IdOrganizacion=@organizationId;
          DELETE FROM OrganizationDailyMetrics WHERE IdOrganizacion=@organizationId;

          INSERT INTO OrganizationDailyMetrics
            (IdOrganizacion, MetricDate, DomainName, EventType, EventCount, LastEventAt)
          SELECT IdOrganizacion, CAST(OccurredAt AS DATE), DomainName, EventType,
                 COUNT(*), MAX(OccurredAt)
          FROM InboxMessages WHERE IdOrganizacion=@organizationId
          GROUP BY IdOrganizacion, CAST(OccurredAt AS DATE), DomainName, EventType;

          INSERT INTO PatientActivity
            (EventId, IdOrganizacion, IdPaciente, DomainName, EventType, AggregateId,
             OccurredAt, Summary, Details)
          SELECT EventId, IdOrganizacion, IdPaciente, DomainName, EventType, AggregateId,
                 OccurredAt, REPLACE(EventType, '.', ' '), Payload
          FROM InboxMessages
          WHERE IdOrganizacion=@organizationId AND IdPaciente IS NOT NULL;

          WITH Counts AS (
            SELECT IdOrganizacion, IdPaciente, DomainName, COUNT(*) AS EventCount
            FROM InboxMessages
            WHERE IdOrganizacion=@organizationId AND IdPaciente IS NOT NULL
            GROUP BY IdOrganizacion, IdPaciente, DomainName
          ), Latest AS (
            SELECT *, ROW_NUMBER() OVER (
              PARTITION BY IdOrganizacion, IdPaciente, DomainName
              ORDER BY OccurredAt DESC, EventId DESC) AS rn
            FROM InboxMessages
            WHERE IdOrganizacion=@organizationId AND IdPaciente IS NOT NULL
          )
          INSERT INTO PatientDomainState
            (IdOrganizacion, IdPaciente, DomainName, EventCount, LastEventType,
             LastAggregateId, LastEventAt)
          SELECT counts.IdOrganizacion, counts.IdPaciente, counts.DomainName, counts.EventCount,
                 latest.EventType, latest.AggregateId, latest.OccurredAt
          FROM Counts counts JOIN Latest latest
            ON latest.IdOrganizacion=counts.IdOrganizacion AND latest.IdPaciente=counts.IdPaciente
               AND latest.DomainName=counts.DomainName AND latest.rn=1;

          SELECT COUNT(*) AS events
          FROM InboxMessages WHERE IdOrganizacion=@organizationId;`);
      await transaction.commit();
      return { rebuilt: true };
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }
}

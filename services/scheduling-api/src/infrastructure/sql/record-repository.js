import { database, sql } from "./database.js";

function map(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patientId,
    title: row.title,
    status: row.status,
    type: row.type,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timeZone: row.timeZone,
    location: row.location,
    notes: row.notes,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const select = `
  SELECT IdAppointment AS id, IdPaciente AS patientId, Titulo AS title,
         Estado AS status, AppointmentType AS type, StartsAt AS startsAt, EndsAt AS endsAt,
         TimeZone AS timeZone, Location AS location, Notes AS notes, Version AS version,
         FechaCreacion AS createdAt, FechaActualizacion AS updatedAt
  FROM Appointments`;

function localParts(iso, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: weekdays[parts.weekday], time: `${parts.hour}:${parts.minute}` };
}

export class SqlRecordRepository {
  async list(actor, filters = {}) {
    const pool = await database();
    const request = pool.request().input("organizationId", sql.UniqueIdentifier, actor.organizationId);
    const conditions = ["IdOrganizacion=@organizationId"];
    if (filters.patientId) {
      request.input("patientId", sql.UniqueIdentifier, filters.patientId);
      conditions.push("IdPaciente=@patientId");
    }
    if (filters.from) {
      request.input("from", sql.DateTime2, new Date(filters.from));
      conditions.push("EndsAt>=@from");
    }
    if (filters.to) {
      request.input("to", sql.DateTime2, new Date(filters.to));
      conditions.push("StartsAt<=@to");
    }
    const result = await request.query(`${select} WHERE ${conditions.join(" AND ")}
      ORDER BY StartsAt, FechaCreacion`);
    return result.recordset.map(map);
  }

  async get(actor, id) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`${select} WHERE IdOrganizacion=@organizationId AND IdAppointment=@id`);
    return map(result.recordset[0]);
  }

  async create(actor, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(input.endsAt);
      const localStart = localParts(input.startsAt, input.timeZone);
      const localEnd = localParts(input.endsAt, input.timeZone);
      const availability = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("owner", sql.Int, actor.id)
        .input("weekday", sql.TinyInt, localStart.weekday)
        .input("localStart", sql.VarChar(5), localStart.time)
        .input("localEnd", sql.VarChar(5), localEnd.time)
        .input("startsAt", sql.DateTime2, startsAt)
        .input("endsAt", sql.DateTime2, endsAt)
        .query(`
          SELECT
            (SELECT COUNT(*) FROM AvailabilityRules
             WHERE IdOrganizacion=@organizationId AND IdNutricionista=@owner AND Active=1) AS ruleCount,
            (SELECT COUNT(*) FROM AvailabilityRules
             WHERE IdOrganizacion=@organizationId AND IdNutricionista=@owner AND Active=1
               AND Weekday=@weekday AND StartTime<=CONVERT(time,@localStart)
               AND EndTime>=CONVERT(time,@localEnd)) AS matchingRules,
            (SELECT COUNT(*) FROM AvailabilityExceptions
             WHERE IdOrganizacion=@organizationId AND IdNutricionista=@owner AND Available=0
               AND StartsAt<@endsAt AND EndsAt>@startsAt) AS blocked,
            (SELECT COUNT(*) FROM AvailabilityExceptions
             WHERE IdOrganizacion=@organizationId AND IdNutricionista=@owner AND Available=1
               AND StartsAt<=@startsAt AND EndsAt>=@endsAt) AS availableOverride,
            (SELECT COUNT(*) FROM Appointments WITH (UPDLOCK, HOLDLOCK)
             WHERE IdOrganizacion=@organizationId AND IdNutricionista=@owner
               AND Estado IN ('scheduled','confirmed')
               AND StartsAt<@endsAt AND EndsAt>@startsAt) AS conflicts`);
      const check = availability.recordset[0];
      if (check.blocked || (check.ruleCount && !check.matchingRules && !check.availableOverride)) {
        await transaction.rollback();
        return { unavailable: true };
      }
      if (check.conflicts) {
        await transaction.rollback();
        return { conflict: true };
      }
      const inserted = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("owner", sql.Int, actor.id)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("title", sql.NVarChar(200), input.title)
        .input("type", sql.VarChar(40), input.type)
        .input("startsAt", sql.DateTime2, startsAt)
        .input("endsAt", sql.DateTime2, endsAt)
        .input("timeZone", sql.NVarChar(80), input.timeZone)
        .input("location", sql.NVarChar(300), input.location)
        .input("notes", sql.NVarChar(2000), input.notes)
        .query(`INSERT INTO Appointments
          (IdOrganizacion, IdNutricionista, IdPaciente, Titulo, Estado, Datos,
           StartsAt, EndsAt, AppointmentType, TimeZone, Location, Notes)
          OUTPUT INSERTED.IdAppointment AS id
          VALUES
          (@organizationId, @owner, @patientId, @title, 'scheduled', '{}',
           @startsAt, @endsAt, @type, @timeZone, @location, @notes)`);
      const id = inserted.recordset[0].id;
      await this.addHistory(transaction, actor, id, null, "scheduled", null);
      await this.addEvent(transaction, "scheduling.appointment.scheduled.v1", id, actor, {
        patientId: input.patientId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timeZone: input.timeZone,
      });
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async changeStatus(actor, id, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const current = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("id", sql.UniqueIdentifier, id)
        .query(`SELECT Estado AS status, Version AS version, IdPaciente AS patientId,
                       StartsAt AS startsAt, EndsAt AS endsAt
                FROM Appointments WITH (UPDLOCK, HOLDLOCK)
                WHERE IdOrganizacion=@organizationId AND IdAppointment=@id`);
      const row = current.recordset[0];
      if (!row) {
        await transaction.rollback();
        return null;
      }
      if (row.version !== input.expectedVersion) {
        await transaction.rollback();
        return { conflict: true };
      }
      await new sql.Request(transaction)
        .input("id", sql.UniqueIdentifier, id)
        .input("status", sql.VarChar(30), input.status)
        .query(`UPDATE Appointments SET Estado=@status, Version=Version+1,
                       FechaActualizacion=SYSUTCDATETIME() WHERE IdAppointment=@id`);
      await this.addHistory(transaction, actor, id, row.status, input.status, input.reason);
      await this.addEvent(transaction, `scheduling.appointment.${input.status}.v1`, id, actor, {
        patientId: row.patientId,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        reason: input.reason,
      });
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async history(actor, id) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT PreviousStatus AS previousStatus, NewStatus AS newStatus,
                     Reason AS reason, ChangedBy AS changedBy, ChangedAt AS changedAt
              FROM AppointmentStatusHistory
              WHERE IdOrganizacion=@organizationId AND IdAppointment=@id
              ORDER BY ChangedAt`);
    return result.recordset;
  }

  async availability(actor) {
    const pool = await database();
    const rules = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("owner", sql.Int, actor.id)
      .query(`SELECT IdAvailabilityRule AS id, Weekday AS weekday,
                     CONVERT(varchar(5), StartTime, 108) AS startTime,
                     CONVERT(varchar(5), EndTime, 108) AS endTime,
                     TimeZone AS timeZone, SlotMinutes AS slotMinutes, Active AS active
              FROM AvailabilityRules
              WHERE IdOrganizacion=@organizationId AND IdNutricionista=@owner ORDER BY Weekday, StartTime;
              SELECT IdAvailabilityException AS id, StartsAt AS startsAt, EndsAt AS endsAt,
                     Available AS available, Reason AS reason
              FROM AvailabilityExceptions
              WHERE IdOrganizacion=@organizationId AND IdNutricionista=@owner
                AND EndsAt>=SYSUTCDATETIME() ORDER BY StartsAt`);
    return { rules: rules.recordsets[0], exceptions: rules.recordsets[1] };
  }

  async addAvailabilityRule(actor, input) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("owner", sql.Int, actor.id)
      .input("weekday", sql.TinyInt, input.weekday)
      .input("startTime", sql.VarChar(5), input.startTime)
      .input("endTime", sql.VarChar(5), input.endTime)
      .input("timeZone", sql.NVarChar(80), input.timeZone)
      .input("slotMinutes", sql.SmallInt, input.slotMinutes)
      .query(`INSERT INTO AvailabilityRules
                (IdOrganizacion, IdNutricionista, Weekday, StartTime, EndTime, TimeZone, SlotMinutes)
              OUTPUT INSERTED.IdAvailabilityRule AS id
              VALUES (@organizationId, @owner, @weekday, CONVERT(time,@startTime),
                      CONVERT(time,@endTime), @timeZone, @slotMinutes)`);
    return { id: result.recordset[0].id, ...input, active: true };
  }

  async addAvailabilityException(actor, input) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("owner", sql.Int, actor.id)
      .input("startsAt", sql.DateTime2, new Date(input.startsAt))
      .input("endsAt", sql.DateTime2, new Date(input.endsAt))
      .input("available", sql.Bit, input.available)
      .input("reason", sql.NVarChar(300), input.reason)
      .query(`INSERT INTO AvailabilityExceptions
                (IdOrganizacion, IdNutricionista, StartsAt, EndsAt, Available, Reason)
              OUTPUT INSERTED.IdAvailabilityException AS id
              VALUES (@organizationId, @owner, @startsAt, @endsAt, @available, @reason)`);
    return { id: result.recordset[0].id, ...input };
  }

  async slots(actor, range) {
    const [availability, appointments] = await Promise.all([
      this.availability(actor),
      this.list(actor, { from: range.from, to: range.to }),
    ]);
    return {
      from: range.from,
      to: range.to,
      rules: availability.rules,
      exceptions: availability.exceptions.filter((item) =>
        new Date(item.startsAt) < new Date(range.to) && new Date(item.endsAt) > new Date(range.from)),
      busy: appointments.filter((item) => ["scheduled", "confirmed"].includes(item.status))
        .map((item) => ({ appointmentId: item.id, startsAt: item.startsAt, endsAt: item.endsAt })),
    };
  }

  async addHistory(transaction, actor, id, previousStatus, newStatus, reason) {
    await new sql.Request(transaction)
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .input("previousStatus", sql.VarChar(30), previousStatus)
      .input("newStatus", sql.VarChar(30), newStatus)
      .input("reason", sql.NVarChar(500), reason)
      .input("actorId", sql.Int, actor.id)
      .query(`INSERT INTO AppointmentStatusHistory
        (IdOrganizacion, IdAppointment, PreviousStatus, NewStatus, Reason, ChangedBy)
        VALUES (@organizationId, @id, @previousStatus, @newStatus, @reason, @actorId)`);
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
      .query("INSERT INTO OutboxMessages (EventType, AggregateId, Payload) VALUES (@eventType, @aggregateId, @payload)");
  }
}

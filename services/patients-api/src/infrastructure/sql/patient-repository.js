import { database, sql } from "./database.js";

const patientSelect = `SELECT IdPaciente AS id, Nombres AS names, Apellidos AS lastNames,
  NombrePreferido AS preferredName, TipoDocumento AS documentType, Documento AS document,
  CONVERT(varchar, FechaNacimiento, 23) AS birthDate, Sexo AS sex, Telefono AS phone,
  Email AS email, Direccion AS address, Ciudad AS city, Pais AS country,
  Objetivo AS objective, FotoRuta AS photoPath, Estado AS status, Version AS version,
  FechaCreacion AS createdAt, FechaActualizacion AS updatedAt
  FROM Pacientes`;

const mapPatient = (row) => row || null;
const requestFor = (pool, actor) => pool.request()
  .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
  .input("actorId", sql.Int, actor.id);

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return value.date && value.id ? value : null;
  } catch {
    return null;
  }
}

function eventPayload(eventType, aggregateId, actor, data) {
  return JSON.stringify({
    eventId: crypto.randomUUID(), eventType, occurredAt: new Date().toISOString(),
    organizationId: actor.organizationId, actorId: actor.id, aggregateId, data,
  });
}

export class SqlPatientRepository {
  async list(actor, filters) {
    const pool = await database();
    const cursor = decodeCursor(filters.cursor);
    const request = requestFor(pool, actor)
      .input("take", sql.Int, filters.limit + 1)
      .input("query", sql.NVarChar(120), filters.query || null)
      .input("search", sql.NVarChar(130), filters.query ? `%${filters.query}%` : null)
      .input("status", sql.VarChar(20), filters.status || null)
      .input("tagId", sql.UniqueIdentifier, filters.tagId || null)
      .input("cursorDate", sql.DateTime2, cursor?.date ? new Date(cursor.date) : null)
      .input("cursorId", sql.UniqueIdentifier, cursor?.id || null);
    const result = await request.query(`SELECT TOP (@take) patient.IdPaciente AS id,
        patient.Nombres AS names, patient.Apellidos AS lastNames,
        patient.NombrePreferido AS preferredName, patient.TipoDocumento AS documentType,
        patient.Documento AS document, CONVERT(varchar, patient.FechaNacimiento, 23) AS birthDate,
        patient.Sexo AS sex, patient.Telefono AS phone, patient.Email AS email,
        patient.Direccion AS address, patient.Ciudad AS city, patient.Pais AS country,
        patient.Objetivo AS objective, patient.FotoRuta AS photoPath, patient.Estado AS status,
        patient.Version AS version, patient.FechaCreacion AS createdAt,
        patient.FechaActualizacion AS updatedAt
      FROM Pacientes patient
      WHERE patient.IdOrganizacion=@organizationId AND patient.EliminadoEn IS NULL
        AND (@status IS NULL OR patient.Estado=@status)
        AND (@query IS NULL OR patient.Nombres LIKE @search OR patient.Apellidos LIKE @search
          OR patient.Documento LIKE @search OR patient.Email LIKE @search)
        AND (@tagId IS NULL OR EXISTS (
          SELECT 1 FROM EtiquetasPaciente tag WHERE tag.IdPaciente=patient.IdPaciente AND tag.IdEtiqueta=@tagId))
        AND (@cursorDate IS NULL OR patient.FechaActualizacion < @cursorDate
          OR (patient.FechaActualizacion=@cursorDate AND patient.IdPaciente < @cursorId))
      ORDER BY patient.FechaActualizacion DESC, patient.IdPaciente DESC`);
    const hasMore = result.recordset.length > filters.limit;
    const rows = result.recordset.slice(0, filters.limit).map(mapPatient);
    const last = rows.at(-1);
    return {
      items: rows,
      nextCursor: hasMore && last
        ? Buffer.from(JSON.stringify({ date: last.updatedAt, id: last.id })).toString("base64url")
        : null,
    };
  }

  async get(actor, id) {
    const pool = await database();
    const result = await requestFor(pool, actor).input("id", sql.UniqueIdentifier, id)
      .query(`${patientSelect} WHERE IdPaciente=@id AND IdOrganizacion=@organizationId AND EliminadoEn IS NULL`);
    return mapPatient(result.recordset[0]);
  }

  async findDuplicate(actor, patient, excludedId = null) {
    if (!patient.document && !patient.email) return null;
    const pool = await database();
    const result = await requestFor(pool, actor)
      .input("excludedId", sql.UniqueIdentifier, excludedId)
      .input("document", sql.NVarChar(30), patient.document || null)
      .input("email", sql.NVarChar(180), patient.email || null)
      .query(`SELECT TOP 1 IdPaciente AS id FROM Pacientes
              WHERE IdOrganizacion=@organizationId AND EliminadoEn IS NULL
                AND (@excludedId IS NULL OR IdPaciente<>@excludedId)
                AND ((@document IS NOT NULL AND Documento=@document)
                  OR (@email IS NOT NULL AND LOWER(Email)=LOWER(@email)))`);
    return result.recordset[0] || null;
  }

  async create(actor, patient) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await this.patientRequest(new sql.Request(transaction), actor, patient)
        .query(`INSERT INTO Pacientes
          (IdOrganizacion, IdNutricionista, CreadoPor, Nombres, Apellidos, NombrePreferido,
           TipoDocumento, Documento, FechaNacimiento, Sexo, Telefono, Email, Direccion,
           Ciudad, Pais, Objetivo, FotoRuta, Estado)
          OUTPUT INSERTED.IdPaciente AS id
          VALUES (@organizationId, @actorId, @actorId, @names, @lastNames, @preferredName,
           @documentType, @document, @birthDate, @sex, @phone, @email, @address,
           @city, @country, @objective, @photoPath, @status)`);
      const id = result.recordset[0].id;
      await new sql.Request(transaction)
        .input("id", sql.UniqueIdentifier, id).input("userId", sql.Int, actor.id)
        .query(`INSERT INTO AsignacionesPaciente (IdPaciente, IdUsuario, Rol, AsignadoPor)
                VALUES (@id, @userId, 'NUTRITIONIST', @userId)`);
      await this.addHistoryEvent(transaction, id, actor, "patient_created", {});
      await this.addEvent(transaction, "patients.created.v1", id, actor, { status: patient.status });
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async update(actor, id, patient) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await this.patientRequest(new sql.Request(transaction), actor, patient)
        .input("id", sql.UniqueIdentifier, id)
        .input("expectedVersion", sql.Int, patient.version || null)
        .query(`UPDATE Pacientes SET Nombres=@names, Apellidos=@lastNames,
          NombrePreferido=@preferredName, TipoDocumento=@documentType, Documento=@document,
          FechaNacimiento=@birthDate, Sexo=@sex, Telefono=@phone, Email=@email,
          Direccion=@address, Ciudad=@city, Pais=@country, Objetivo=@objective,
          FotoRuta=@photoPath, Estado=@status, Version=Version+1,
          FechaActualizacion=SYSUTCDATETIME()
          WHERE IdPaciente=@id AND IdOrganizacion=@organizationId AND EliminadoEn IS NULL
            AND (@expectedVersion IS NULL OR Version=@expectedVersion)`);
      if (!result.rowsAffected[0]) {
        await transaction.rollback();
        return null;
      }
      await this.addHistoryEvent(transaction, id, actor, "patient_updated", { status: patient.status });
      await this.addEvent(transaction, "patients.updated.v1", id, actor, { status: patient.status });
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async remove(actor, id) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input("id", sql.UniqueIdentifier, id)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .query(`UPDATE Pacientes SET Estado='Inactivo', EliminadoEn=SYSUTCDATETIME(),
                Version=Version+1, FechaActualizacion=SYSUTCDATETIME()
                WHERE IdPaciente=@id AND IdOrganizacion=@organizationId AND EliminadoEn IS NULL`);
      if (!result.rowsAffected[0]) { await transaction.rollback(); return false; }
      await this.addHistoryEvent(transaction, id, actor, "patient_archived", {});
      await this.addEvent(transaction, "patients.archived.v1", id, actor, {});
      await transaction.commit();
      return true;
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async history(actor, patientId) {
    const pool = await database();
    const result = await requestFor(pool, actor).input("patientId", sql.UniqueIdentifier, patientId)
      .query(`SELECT history.IdEvento AS id, history.OcurridoEn AS date,
                     history.TipoEvento AS type,
                     COALESCE(JSON_VALUE(history.Datos, '$.notes'), history.TipoEvento) AS notes
              FROM HistorialAdministrativoPaciente history
              JOIN Pacientes patient ON patient.IdPaciente=history.IdPaciente
              WHERE history.IdPaciente=@patientId AND patient.IdOrganizacion=@organizationId
              ORDER BY history.OcurridoEn DESC`);
    return result.recordset;
  }

  async addHistory(actor, patientId, entry) {
    const pool = await database();
    if (!(await this.get(actor, patientId))) return null;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const id = await this.addHistoryEvent(transaction, patientId, actor, "administrative_note", entry);
      await transaction.commit();
      return { id, date: new Date().toISOString(), type: entry.type, notes: entry.notes };
    } catch (error) { await transaction.rollback(); throw error; }
  }

  contacts(actor, id) { return this.related(actor, id, `SELECT contact.IdContacto AS id, contact.Tipo AS type,
    contact.Valor AS value, contact.Etiqueta AS label, contact.Principal AS [primary]
    FROM ContactosPaciente contact`); }

  async addContact(actor, id, contact) {
    const pool = await database();
    const result = await requestFor(pool, actor)
      .input("id", sql.UniqueIdentifier, id).input("type", sql.VarChar(20), contact.type)
      .input("value", sql.NVarChar(180), contact.value).input("label", sql.NVarChar(60), contact.label || null)
      .input("primary", sql.Bit, contact.primary)
      .query(`INSERT INTO ContactosPaciente (IdPaciente, Tipo, Valor, Etiqueta, Principal)
              OUTPUT INSERTED.IdContacto AS id
              SELECT IdPaciente, @type, @value, @label, @primary FROM Pacientes
              WHERE IdPaciente=@id AND IdOrganizacion=@organizationId AND EliminadoEn IS NULL`);
    return result.recordset[0] || null;
  }

  emergencyContacts(actor, id) { return this.related(actor, id, `SELECT contact.IdContactoEmergencia AS id,
    contact.Nombre AS name, contact.Relacion AS relationship, contact.Telefono AS phone,
    contact.Email AS email, contact.Principal AS [primary] FROM ContactosEmergencia contact`); }

  async addEmergencyContact(actor, id, contact) {
    const pool = await database();
    const result = await requestFor(pool, actor).input("id", sql.UniqueIdentifier, id)
      .input("name", sql.NVarChar(150), contact.name).input("relationship", sql.NVarChar(80), contact.relationship || null)
      .input("phone", sql.NVarChar(30), contact.phone).input("email", sql.NVarChar(180), contact.email || null)
      .input("primary", sql.Bit, contact.primary)
      .query(`INSERT INTO ContactosEmergencia (IdPaciente, Nombre, Relacion, Telefono, Email, Principal)
              OUTPUT INSERTED.IdContactoEmergencia AS id
              SELECT IdPaciente, @name, @relationship, @phone, @email, @primary FROM Pacientes
              WHERE IdPaciente=@id AND IdOrganizacion=@organizationId AND EliminadoEn IS NULL`);
    return result.recordset[0] || null;
  }

  assignments(actor, id) { return this.related(actor, id, `SELECT assignment.IdUsuario AS userId,
    assignment.Rol AS role, assignment.Activa AS active, assignment.FechaAsignacion AS assignedAt
    FROM AsignacionesPaciente assignment`); }

  async assign(actor, id, assignment) {
    const pool = await database();
    if (!(await this.get(actor, id))) return null;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).input("id", sql.UniqueIdentifier, id)
        .input("userId", sql.Int, assignment.userId).input("role", sql.VarChar(30), assignment.role)
        .input("actorId", sql.Int, actor.id)
        .query(`MERGE AsignacionesPaciente AS target
                USING (SELECT @id AS IdPaciente, @userId AS IdUsuario) AS source
                ON target.IdPaciente=source.IdPaciente AND target.IdUsuario=source.IdUsuario
                WHEN MATCHED THEN UPDATE SET Rol=@role, Activa=1, FechaFin=NULL, AsignadoPor=@actorId
                WHEN NOT MATCHED THEN INSERT (IdPaciente, IdUsuario, Rol, AsignadoPor)
                  VALUES (@id, @userId, @role, @actorId);`);
      await this.addHistoryEvent(transaction, id, actor, "patient_assigned", assignment);
      await this.addEvent(transaction, "patients.assigned.v1", id, actor, assignment);
      await transaction.commit();
      return assignment;
    } catch (error) { await transaction.rollback(); throw error; }
  }

  tags(actor, id) { return this.related(actor, id, `SELECT tag.IdEtiqueta AS id, tag.Nombre AS name,
    tag.Color AS color FROM EtiquetasPaciente link JOIN Etiquetas tag ON tag.IdEtiqueta=link.IdEtiqueta`); }

  async addTag(actor, id, tag) {
    const pool = await database();
    if (!(await this.get(actor, id))) return null;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("name", sql.NVarChar(60), tag.name).input("color", sql.Char(7), tag.color)
        .query(`IF NOT EXISTS (SELECT 1 FROM Etiquetas WHERE IdOrganizacion=@organizationId AND Nombre=@name)
                  INSERT INTO Etiquetas (IdOrganizacion, Nombre, Color) VALUES (@organizationId, @name, @color);
                SELECT IdEtiqueta AS id, Nombre AS name, Color AS color FROM Etiquetas
                WHERE IdOrganizacion=@organizationId AND Nombre=@name;`);
      const saved = result.recordset[0];
      await new sql.Request(transaction).input("patientId", sql.UniqueIdentifier, id)
        .input("tagId", sql.UniqueIdentifier, saved.id)
        .query(`IF NOT EXISTS (SELECT 1 FROM EtiquetasPaciente WHERE IdPaciente=@patientId AND IdEtiqueta=@tagId)
                  INSERT INTO EtiquetasPaciente (IdPaciente, IdEtiqueta) VALUES (@patientId, @tagId)`);
      await transaction.commit();
      return saved;
    } catch (error) { await transaction.rollback(); throw error; }
  }

  consents(actor, id) { return this.related(actor, id, `SELECT consent.IdConsentimiento AS id,
    consent.Tipo AS type, consent.Estado AS status, consent.VersionDocumento AS documentVersion,
    consent.Evidencia AS evidence, consent.OtorgadoEn AS grantedAt, consent.RevocadoEn AS revokedAt
    FROM ConsentimientosPaciente consent`); }

  async addConsent(actor, id, consent) {
    const pool = await database();
    const result = await requestFor(pool, actor).input("id", sql.UniqueIdentifier, id)
      .input("type", sql.VarChar(40), consent.type).input("status", sql.VarChar(20), consent.status)
      .input("version", sql.NVarChar(40), consent.documentVersion)
      .input("evidence", sql.NVarChar(500), consent.evidence || null)
      .query(`INSERT INTO ConsentimientosPaciente
              (IdPaciente, Tipo, Estado, VersionDocumento, Evidencia, RegistradoPor, OtorgadoEn, RevocadoEn)
              OUTPUT INSERTED.IdConsentimiento AS id
              SELECT IdPaciente, @type, @status, @version, @evidence, @actorId,
                     CASE WHEN @status='granted' THEN SYSUTCDATETIME() END,
                     CASE WHEN @status='revoked' THEN SYSUTCDATETIME() END
              FROM Pacientes WHERE IdPaciente=@id AND IdOrganizacion=@organizationId AND EliminadoEn IS NULL`);
    return result.recordset[0] || null;
  }

  async related(actor, id, select) {
    const pool = await database();
    const result = await requestFor(pool, actor).input("id", sql.UniqueIdentifier, id)
      .query(`${select} JOIN Pacientes patient ON patient.IdPaciente=@id
              WHERE patient.IdPaciente=@id AND patient.IdOrganizacion=@organizationId
                AND patient.EliminadoEn IS NULL AND ${select.includes(" link ") ? "link.IdPaciente" : select.includes("contact.") ? "contact.IdPaciente" : select.includes("assignment.") ? "assignment.IdPaciente" : "consent.IdPaciente"}=@id`);
    return result.recordset;
  }

  patientRequest(request, actor, patient) {
    return request.input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("actorId", sql.Int, actor.id).input("names", sql.NVarChar(100), patient.names)
      .input("lastNames", sql.NVarChar(100), patient.lastNames)
      .input("preferredName", sql.NVarChar(100), patient.preferredName || null)
      .input("documentType", sql.VarChar(20), patient.documentType || null)
      .input("document", sql.NVarChar(30), patient.document || null)
      .input("birthDate", sql.Date, patient.birthDate || null).input("sex", sql.NVarChar(20), patient.sex || null)
      .input("phone", sql.NVarChar(30), patient.phone || null).input("email", sql.NVarChar(180), patient.email || null)
      .input("address", sql.NVarChar(250), patient.address || null).input("city", sql.NVarChar(100), patient.city || null)
      .input("country", sql.Char(2), patient.country || null).input("objective", sql.NVarChar(300), patient.objective || null)
      .input("photoPath", sql.NVarChar(500), patient.photoPath || null).input("status", sql.VarChar(20), patient.status);
  }

  async addHistoryEvent(transaction, patientId, actor, eventType, data) {
    const id = crypto.randomUUID();
    await new sql.Request(transaction).input("id", sql.UniqueIdentifier, id)
      .input("patientId", sql.UniqueIdentifier, patientId).input("eventType", sql.VarChar(60), eventType)
      .input("actorId", sql.Int, actor.id).input("data", sql.NVarChar(sql.MAX), JSON.stringify(data))
      .query(`INSERT INTO HistorialAdministrativoPaciente (IdEvento, IdPaciente, TipoEvento, ActorId, Datos)
              VALUES (@id, @patientId, @eventType, @actorId, @data)`);
    return id;
  }

  async addEvent(transaction, eventType, aggregateId, actor, data) {
    await new sql.Request(transaction).input("eventType", sql.NVarChar(160), eventType)
      .input("aggregateId", sql.UniqueIdentifier, aggregateId)
      .input("payload", sql.NVarChar(sql.MAX), eventPayload(eventType, aggregateId, actor, data))
      .query("INSERT INTO OutboxMessages (EventType, AggregateId, Payload) VALUES (@eventType, @aggregateId, @payload)");
  }
}

import { database, sql } from "./database.js";

export class SqlUserRepository {
  async findByEmail(email) {
    const pool = await database();
    const result = await pool.request().input("email", sql.NVarChar(180), email).query(`
      SELECT TOP 1 userRow.IdUsuario id, userRow.Nombre name, userRow.Email email,
        userRow.Rol role, userRow.PasswordHash passwordHash, userRow.Activo active,
        userRow.IdOrganizacion organizationId, member.Rol organizationRole,
        member.IdPaciente patientId
      FROM Usuarios userRow
      JOIN MiembrosOrganizacion member
        ON member.IdUsuario = userRow.IdUsuario
        AND member.IdOrganizacion = userRow.IdOrganizacion
        AND member.Activo = 1
      WHERE userRow.Email = @email
    `);
    return result.recordset[0] || null;
  }

  async findActiveById(id, organizationId) {
    const pool = await database();
    const request = pool.request().input("id", sql.Int, id);
    let organizationFilter = "userRow.IdOrganizacion";
    if (organizationId) {
      request.input("organizationId", sql.UniqueIdentifier, organizationId);
      organizationFilter = "@organizationId";
    }
    const result = await request.query(`
      SELECT userRow.IdUsuario id, userRow.Nombre name, userRow.Email email,
        userRow.Rol role, userRow.Matricula license, userRow.Especialidad specialty,
        userRow.Apariencia appearance, member.IdOrganizacion organizationId,
        member.Rol organizationRole, member.IdPaciente patientId
      FROM Usuarios userRow
      JOIN MiembrosOrganizacion member
        ON member.IdUsuario = userRow.IdUsuario
        AND member.IdOrganizacion = ${organizationFilter}
        AND member.Activo = 1
      JOIN Organizaciones organization
        ON organization.IdOrganizacion = member.IdOrganizacion AND organization.Activa = 1
      WHERE userRow.IdUsuario = @id AND userRow.Activo = 1
    `);
    return result.recordset[0] || null;
  }

  async create({ name, email, passwordHash }) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const organizationId = crypto.randomUUID();
      const slug = `org-${organizationId.toLowerCase()}`;
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("organizationName", sql.NVarChar(150), name)
        .input("slug", sql.VarChar(80), slug)
        .query(`INSERT INTO Organizaciones (IdOrganizacion, Nombre, Slug)
                VALUES (@organizationId, @organizationName, @slug)`);
      const result = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("name", sql.NVarChar(120), name)
        .input("email", sql.NVarChar(180), email)
        .input("passwordHash", sql.NVarChar(255), passwordHash)
        .query(`
          INSERT INTO Usuarios (IdOrganizacion, Nombre, Email, PasswordHash)
          OUTPUT INSERTED.IdUsuario id, INSERTED.Nombre name,
            INSERTED.Email email, INSERTED.Rol role,
            INSERTED.IdOrganizacion organizationId
          VALUES (@organizationId, @name, @email, @passwordHash)
        `);
      const user = result.recordset[0];
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("userId", sql.Int, user.id)
        .query(`INSERT INTO MiembrosOrganizacion (IdOrganizacion, IdUsuario, Rol)
                VALUES (@organizationId, @userId, 'OWNER')`);
      await transaction.commit();
      return { ...user, organizationRole: "OWNER" };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async listOrganizations(id) {
    const pool = await database();
    const result = await pool.request().input("id", sql.Int, id).query(`
      SELECT organization.IdOrganizacion id, organization.Nombre name,
        organization.Slug slug, member.Rol role
      FROM MiembrosOrganizacion member
      JOIN Organizaciones organization
        ON organization.IdOrganizacion = member.IdOrganizacion
      WHERE member.IdUsuario = @id AND member.Activo = 1 AND organization.Activa = 1
      ORDER BY organization.Nombre
    `);
    return result.recordset;
  }

  async createOrganization(actor, name) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const organizationId = crypto.randomUUID();
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("name", sql.NVarChar(150), name)
        .input("slug", sql.VarChar(80), `org-${organizationId.toLowerCase()}`)
        .query(`INSERT INTO Organizaciones (IdOrganizacion, Nombre, Slug)
                VALUES (@organizationId, @name, @slug)`);
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("userId", sql.Int, actor.id)
        .query(`INSERT INTO MiembrosOrganizacion (IdOrganizacion, IdUsuario, Rol)
                VALUES (@organizationId, @userId, 'OWNER')`);
      await transaction.commit();
      return { id: organizationId, name, slug: `org-${organizationId.toLowerCase()}`, role: "OWNER" };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async createInvitation(actor, { email, role, patientId, tokenHash, expiresAt }) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("email", sql.NVarChar(180), email)
      .input("role", sql.VarChar(20), role)
      .input("patientId", sql.UniqueIdentifier, patientId || null)
      .input("tokenHash", sql.Char(64), tokenHash)
      .input("invitedBy", sql.Int, actor.id)
      .input("expiresAt", sql.DateTime2, expiresAt)
      .query(`INSERT INTO InvitacionesOrganizacion
              (IdOrganizacion, Email, Rol, IdPaciente, TokenHash, InvitadoPor, ExpiraEn)
              OUTPUT INSERTED.IdInvitacion AS id, INSERTED.IdOrganizacion AS organizationId,
                     INSERTED.Email AS email, INSERTED.Rol AS role, INSERTED.IdPaciente AS patientId,
                     INSERTED.ExpiraEn AS expiresAt
              VALUES (@organizationId, @email, @role, @patientId, @tokenHash, @invitedBy, @expiresAt)`);
    return result.recordset[0];
  }

  async acceptInvitation(actor, tokenHash) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const invitation = await new sql.Request(transaction)
        .input("tokenHash", sql.Char(64), tokenHash)
        .input("userId", sql.Int, actor.id)
        .query(`SELECT TOP 1 invitation.IdInvitacion AS id,
                       invitation.IdOrganizacion AS organizationId,
                       invitation.Rol AS role, invitation.IdPaciente AS patientId
                FROM InvitacionesOrganizacion invitation WITH (UPDLOCK, HOLDLOCK)
                JOIN Usuarios userRow ON userRow.IdUsuario=@userId
                  AND LOWER(userRow.Email)=LOWER(invitation.Email)
                WHERE invitation.TokenHash=@tokenHash
                  AND invitation.AceptadaEn IS NULL
                  AND invitation.ExpiraEn > SYSUTCDATETIME()`);
      const row = invitation.recordset[0];
      if (!row) {
        await transaction.rollback();
        return null;
      }
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, row.organizationId)
        .input("userId", sql.Int, actor.id)
        .input("role", sql.VarChar(20), row.role)
        .input("patientId", sql.UniqueIdentifier, row.patientId || null)
        .query(`MERGE MiembrosOrganizacion AS target
                USING (SELECT @organizationId AS IdOrganizacion, @userId AS IdUsuario) AS source
                ON target.IdOrganizacion=source.IdOrganizacion AND target.IdUsuario=source.IdUsuario
                WHEN MATCHED THEN UPDATE SET Rol=@role, IdPaciente=@patientId, Activo=1
                WHEN NOT MATCHED THEN INSERT (IdOrganizacion, IdUsuario, Rol, IdPaciente)
                  VALUES (@organizationId, @userId, @role, @patientId);`);
      await new sql.Request(transaction)
        .input("invitationId", sql.UniqueIdentifier, row.id)
        .query("UPDATE InvitacionesOrganizacion SET AceptadaEn=SYSUTCDATETIME() WHERE IdInvitacion=@invitationId");
      await transaction.commit();
      return row;
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async listMembers(organizationId) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .query(`SELECT userRow.IdUsuario AS id, userRow.Nombre AS name, userRow.Email AS email,
                     member.Rol AS role, member.IdPaciente AS patientId, member.Activo AS active
              FROM MiembrosOrganizacion member
              JOIN Usuarios userRow ON userRow.IdUsuario=member.IdUsuario
              WHERE member.IdOrganizacion=@organizationId
              ORDER BY userRow.Nombre`);
    return result.recordset;
  }

  async createRefreshSession({ userId, organizationId, tokenHash, expiresAt }) {
    const pool = await database();
    const id = crypto.randomUUID();
    await pool.request()
      .input("id", sql.UniqueIdentifier, id)
      .input("userId", sql.Int, userId)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("tokenHash", sql.Char(64), tokenHash)
      .input("expiresAt", sql.DateTime2, expiresAt)
      .query(`INSERT INTO SesionesRenovacion
              (IdSesion, IdUsuario, IdOrganizacion, TokenHash, ExpiraEn, FamiliaId)
              VALUES (@id, @userId, @organizationId, @tokenHash, @expiresAt, @id)`);
  }

  async rotateRefreshSession({ tokenHash, replacementHash, replacementExpiresAt }) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const current = await new sql.Request(transaction)
        .input("tokenHash", sql.Char(64), tokenHash)
        .query(`SELECT TOP 1 IdSesion AS id, IdUsuario AS userId,
                       IdOrganizacion AS organizationId, FamiliaId AS familyId
                FROM SesionesRenovacion WITH (UPDLOCK, HOLDLOCK)
                WHERE TokenHash=@tokenHash AND RevocadaEn IS NULL
                  AND ExpiraEn > SYSUTCDATETIME()`);
      const session = current.recordset[0];
      if (!session) {
        const reused = await new sql.Request(transaction)
          .input("tokenHash", sql.Char(64), tokenHash)
          .query(`SELECT TOP 1 FamiliaId AS familyId FROM SesionesRenovacion
                  WHERE TokenHash=@tokenHash AND RevocadaEn IS NOT NULL`);
        if (reused.recordset[0]?.familyId) {
          await new sql.Request(transaction)
            .input("familyId", sql.UniqueIdentifier, reused.recordset[0].familyId)
            .query(`UPDATE SesionesRenovacion
                    SET RevocadaEn=COALESCE(RevocadaEn, SYSUTCDATETIME())
                    WHERE FamiliaId=@familyId`);
          await transaction.commit();
          return null;
        }
        await transaction.rollback();
        return null;
      }
      const replacementId = crypto.randomUUID();
      await new sql.Request(transaction)
        .input("id", sql.UniqueIdentifier, replacementId)
        .input("userId", sql.Int, session.userId)
        .input("organizationId", sql.UniqueIdentifier, session.organizationId)
        .input("tokenHash", sql.Char(64), replacementHash)
        .input("expiresAt", sql.DateTime2, replacementExpiresAt)
        .input("familyId", sql.UniqueIdentifier, session.familyId)
        .query(`INSERT INTO SesionesRenovacion
                (IdSesion, IdUsuario, IdOrganizacion, TokenHash, ExpiraEn, FamiliaId)
                VALUES (@id, @userId, @organizationId, @tokenHash, @expiresAt, @familyId)`);
      await new sql.Request(transaction)
        .input("currentId", sql.UniqueIdentifier, session.id)
        .input("replacementId", sql.UniqueIdentifier, replacementId)
        .query(`UPDATE SesionesRenovacion
                SET RevocadaEn=SYSUTCDATETIME(), UltimoUsoEn=SYSUTCDATETIME(),
                    ReemplazadaPor=@replacementId
                WHERE IdSesion=@currentId`);
      await transaction.commit();
      return session;
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async revokeRefreshSession(tokenHash) {
    const pool = await database();
    const result = await pool.request()
      .input("tokenHash", sql.Char(64), tokenHash)
      .query(`UPDATE SesionesRenovacion SET RevocadaEn=COALESCE(RevocadaEn, SYSUTCDATETIME())
              WHERE TokenHash=@tokenHash`);
    return result.rowsAffected[0] > 0;
  }

  async revokeAllRefreshSessions(userId, organizationId) {
    const pool = await database();
    await pool.request()
      .input("userId", sql.Int, userId)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .query(`UPDATE SesionesRenovacion SET RevocadaEn=COALESCE(RevocadaEn, SYSUTCDATETIME())
              WHERE IdUsuario=@userId AND IdOrganizacion=@organizationId`);
  }

  async createPasswordReset({ userId, tokenHash, expiresAt }) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction)
        .input("userId", sql.Int, userId)
        .query(`UPDATE TokensRecuperacionPassword
                SET UsadoEn=COALESCE(UsadoEn, SYSUTCDATETIME())
                WHERE IdUsuario=@userId AND UsadoEn IS NULL`);
      await new sql.Request(transaction)
        .input("userId", sql.Int, userId)
        .input("tokenHash", sql.Char(64), tokenHash)
        .input("expiresAt", sql.DateTime2, expiresAt)
        .query(`INSERT INTO TokensRecuperacionPassword
                (IdUsuario, TokenHash, ExpiraEn)
                VALUES (@userId, @tokenHash, @expiresAt)`);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async consumePasswordReset(tokenHash, passwordHash) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const result = await new sql.Request(transaction)
        .input("tokenHash", sql.Char(64), tokenHash)
        .query(`SELECT TOP 1 token.IdToken AS id, token.IdUsuario AS userId,
                       userRow.IdOrganizacion AS organizationId
                FROM TokensRecuperacionPassword token WITH (UPDLOCK, HOLDLOCK)
                JOIN Usuarios userRow ON userRow.IdUsuario=token.IdUsuario
                WHERE token.TokenHash=@tokenHash AND token.UsadoEn IS NULL
                  AND token.ExpiraEn > SYSUTCDATETIME()`);
      const reset = result.recordset[0];
      if (!reset) {
        await transaction.rollback();
        return null;
      }
      await new sql.Request(transaction)
        .input("userId", sql.Int, reset.userId)
        .input("resetId", sql.UniqueIdentifier, reset.id)
        .input("passwordHash", sql.NVarChar(255), passwordHash)
        .query(`UPDATE Usuarios SET PasswordHash=@passwordHash WHERE IdUsuario=@userId;
                UPDATE TokensRecuperacionPassword SET UsadoEn=SYSUTCDATETIME() WHERE IdToken=@resetId;
                UPDATE SesionesRenovacion SET RevocadaEn=COALESCE(RevocadaEn, SYSUTCDATETIME())
                WHERE IdUsuario=@userId;`);
      await transaction.commit();
      return { userId: reset.userId, organizationId: reset.organizationId };
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async auditAccess(event) {
    const pool = await database();
    await pool.request()
      .input("userId", sql.Int, event.userId || null)
      .input("organizationId", sql.UniqueIdentifier, event.organizationId || null)
      .input("eventType", sql.VarChar(60), event.eventType)
      .input("success", sql.Bit, event.success)
      .input("requestId", sql.NVarChar(100), event.requestId || null)
      .input("ipHash", sql.Char(64), event.ipHash || null)
      .input("userAgent", sql.NVarChar(300), event.userAgent || null)
      .input("details", sql.NVarChar(sql.MAX), JSON.stringify(event.details || {}))
      .query(`INSERT INTO EventosAuditoriaAcceso
              (IdUsuario, IdOrganizacion, TipoEvento, Exitoso, RequestId, IpHash, UserAgent, Detalles)
              VALUES (@userId, @organizationId, @eventType, @success, @requestId,
                      @ipHash, @userAgent, @details)`);
  }

  async listAccessAudit(actor, limit = 100) {
    const pool = await database();
    const request = pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("userId", sql.Int, actor.id)
      .input("limit", sql.Int, limit);
    const scope = ["OWNER", "ADMIN"].includes(actor.organizationRole)
      ? "IdOrganizacion=@organizationId"
      : "IdOrganizacion=@organizationId AND IdUsuario=@userId";
    const result = await request.query(`
      SELECT TOP (@limit) IdEvento AS id, IdUsuario AS userId,
             TipoEvento AS eventType, Exitoso AS success, RequestId AS requestId,
             Detalles AS details, OcurridoEn AS occurredAt
      FROM EventosAuditoriaAcceso
      WHERE ${scope}
      ORDER BY OcurridoEn DESC`);
    return result.recordset.map((row) => ({
      ...row,
      success: Boolean(row.success),
      details: JSON.parse(row.details || "{}"),
    }));
  }

  async updateProfile(id, { name, license, specialty, appearance }) {
    const pool = await database();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("name", sql.NVarChar(120), name)
      .input("license", sql.NVarChar(80), license || null)
      .input("specialty", sql.NVarChar(120), specialty || null)
      .input("appearance", sql.VarChar(10), appearance)
      .query(`
        UPDATE Usuarios SET Nombre = @name, Matricula = @license,
          Especialidad = @specialty, Apariencia = @appearance
        WHERE IdUsuario = @id AND Activo = 1;
        SELECT @@ROWCOUNT affected;
      `);
    return result.recordset[0].affected > 0;
  }

  async updatePassword(id, passwordHash) {
    const pool = await database();
    await pool.request()
      .input("id", sql.Int, id)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .query("UPDATE Usuarios SET PasswordHash = @passwordHash WHERE IdUsuario = @id AND Activo = 1");
  }
}

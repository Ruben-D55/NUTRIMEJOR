import { database, sql } from "./database.js";

const subscriptionSelect = `
  SELECT IdSubscription AS id, IdOrganizacion AS organizationId, PlanCode AS planCode,
         Estado AS status, Inicio AS startsAt, FinPrueba AS trialEndsAt,
         InicioPeriodo AS periodStartsAt, FinPeriodo AS periodEndsAt,
         Version AS version, FechaActualizacion AS updatedAt
  FROM Subscriptions`;

function mapSubscription(row) {
  return row ? {
    id: row.id,
    organizationId: row.organizationId,
    planCode: row.planCode,
    status: row.status,
    startsAt: row.startsAt,
    trialEndsAt: row.trialEndsAt,
    periodStartsAt: row.periodStartsAt,
    periodEndsAt: row.periodEndsAt,
    version: row.version,
    updatedAt: row.updatedAt,
  } : null;
}

function eventPayload(eventType, aggregateId, actor, data) {
  return JSON.stringify({
    eventId: crypto.randomUUID(), eventType, occurredAt: new Date().toISOString(),
    actorId: actor.id, organizationId: actor.organizationId, aggregateId, data,
  });
}

export class SqlSubscriptionRepository {
  async listPlans() {
    const pool = await database();
    const result = await pool.request().query(`
      SELECT p.Code AS planCode, p.Nombre AS planName, p.Descripcion AS description,
             f.Code AS featureCode, f.Nombre AS featureName, f.Medida AS measure,
             pf.Habilitada AS enabled, pf.LimiteCuota AS quota
      FROM Plans p
      JOIN PlanFeatures pf ON pf.PlanCode=p.Code
      JOIN Features f ON f.Code=pf.FeatureCode
      WHERE p.Activo=1
      ORDER BY p.Orden, f.Code`);
    const plans = new Map();
    for (const row of result.recordset) {
      if (!plans.has(row.planCode)) {
        plans.set(row.planCode, {
          code: row.planCode, name: row.planName, description: row.description, features: [],
        });
      }
      plans.get(row.planCode).features.push({
        code: row.featureCode, name: row.featureName, measure: row.measure,
        enabled: Boolean(row.enabled), quota: row.quota,
      });
    }
    return [...plans.values()];
  }

  async findByOrganization(organizationId) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .query(`${subscriptionSelect} WHERE IdOrganizacion=@organizationId`);
    return mapSubscription(result.recordset[0]);
  }

  async ensureTrial(actor) {
    const existing = await this.findByOrganization(actor.organizationId);
    if (existing) return this.expireTrialIfNeeded(existing, actor);
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const request = new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId);
      const found = await request.query(`${subscriptionSelect} WITH (UPDLOCK, HOLDLOCK) WHERE IdOrganizacion=@organizationId`);
      if (found.recordset[0]) {
        await transaction.commit();
        return this.expireTrialIfNeeded(mapSubscription(found.recordset[0]), actor);
      }
      const inserted = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .query(`INSERT INTO Subscriptions
          (IdOrganizacion, PlanCode, Estado, FinPrueba, FinPeriodo)
          OUTPUT INSERTED.IdSubscription AS id
          VALUES (@organizationId, 'BASIC', 'trialing', DATEADD(day, 14, SYSUTCDATETIME()),
                  DATEADD(month, 1, SYSUTCDATETIME()))`);
      const id = inserted.recordset[0].id;
      await this.addHistory(transaction, id, null, "trialing", null, "BASIC", "Prueba inicial", actor.id);
      await this.addEvent(transaction, "subscriptions.started.v1", id, actor, { planCode: "BASIC", status: "trialing" });
      await transaction.commit();
      return this.findByOrganization(actor.organizationId);
    } catch (error) {
      await transaction.rollback();
      if (error?.number === 2627 || error?.number === 2601) return this.findByOrganization(actor.organizationId);
      throw error;
    }
  }

  async expireTrialIfNeeded(subscription, actor) {
    if (subscription.status !== "trialing" || !subscription.trialEndsAt || subscription.trialEndsAt > new Date()) {
      return subscription;
    }
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    await new sql.Request(transaction).input("id", sql.UniqueIdentifier, subscription.id)
      .query(`UPDATE Subscriptions SET Estado='expired', Version=Version+1,
              FechaActualizacion=SYSUTCDATETIME() WHERE IdSubscription=@id AND Estado='trialing'`);
    await this.addHistory(transaction, subscription.id, "trialing", "expired",
      subscription.planCode, subscription.planCode, "Fin del periodo de prueba", actor.id);
    await this.addEvent(transaction, "subscriptions.expired.v1", subscription.id, actor, {
      planCode: subscription.planCode,
      previousStatus: "trialing",
    });
    await transaction.commit();
    return { ...subscription, status: "expired", version: subscription.version + 1 };
  }

  async planExists(planCode) {
    const pool = await database();
    const result = await pool.request().input("planCode", sql.VarChar(20), planCode)
      .query("SELECT 1 AS found FROM Plans WHERE Code=@planCode AND Activo=1");
    return Boolean(result.recordset[0]);
  }

  async changePlan(actor, planCode) {
    const current = await this.ensureTrial(actor);
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction)
        .input("id", sql.UniqueIdentifier, current.id)
        .input("planCode", sql.VarChar(20), planCode)
        .query(`UPDATE Subscriptions SET PlanCode=@planCode, Estado='active', FinPrueba=NULL,
                InicioPeriodo=SYSUTCDATETIME(), FinPeriodo=DATEADD(month, 1, SYSUTCDATETIME()),
                Version=Version+1, FechaActualizacion=SYSUTCDATETIME()
                WHERE IdSubscription=@id`);
      await this.addHistory(transaction, current.id, current.status, "active",
        current.planCode, planCode, "Cambio de plan", actor.id);
      await this.addEvent(transaction, "subscriptions.plan_changed.v1", current.id, actor, {
        previousPlanCode: current.planCode, planCode,
      });
      await transaction.commit();
      return this.findByOrganization(actor.organizationId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async cancel(actor, reason) {
    const current = await this.ensureTrial(actor);
    if (current.status === "canceled") return current;
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).input("id", sql.UniqueIdentifier, current.id)
        .query(`UPDATE Subscriptions SET Estado='canceled', Version=Version+1,
          FechaActualizacion=SYSUTCDATETIME() WHERE IdSubscription=@id`);
      await this.addHistory(transaction, current.id, current.status, "canceled",
        current.planCode, current.planCode, reason, actor.id);
      await this.addEvent(transaction, "subscriptions.canceled.v1", current.id, actor, {
        planCode: current.planCode,
        reason,
      });
      await transaction.commit();
      return this.findByOrganization(actor.organizationId);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async reactivate(actor) {
    const current = await this.ensureTrial(actor);
    if (["trialing", "active"].includes(current.status)) return current;
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).input("id", sql.UniqueIdentifier, current.id)
        .query(`UPDATE Subscriptions SET Estado='active', InicioPeriodo=SYSUTCDATETIME(),
          FinPeriodo=DATEADD(month,1,SYSUTCDATETIME()), FinPrueba=NULL,
          Version=Version+1, FechaActualizacion=SYSUTCDATETIME()
          WHERE IdSubscription=@id`);
      await this.addHistory(transaction, current.id, current.status, "active",
        current.planCode, current.planCode, "Reactivación", actor.id);
      await this.addEvent(transaction, "subscriptions.reactivated.v1", current.id, actor, {
        planCode: current.planCode,
      });
      await transaction.commit();
      return this.findByOrganization(actor.organizationId);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async history(actor) {
    const current = await this.ensureTrial(actor);
    const pool = await database();
    const result = await pool.request().input("id", sql.UniqueIdentifier, current.id)
      .query(`SELECT PreviousStatus AS previousStatus, NewStatus AS newStatus,
        PreviousPlanCode AS previousPlanCode, NewPlanCode AS newPlanCode,
        Reason AS reason, ChangedBy AS changedBy, ChangedAt AS changedAt
        FROM SubscriptionStatusHistory WHERE IdSubscription=@id ORDER BY ChangedAt`);
    return result.recordset;
  }

  async entitlements(actor) {
    const subscription = await this.ensureTrial(actor);
    const active = ["trialing", "active"].includes(subscription.status);
    const period = new Date().toISOString().slice(0, 7);
    const pool = await database();
    const result = await pool.request()
      .input("planCode", sql.VarChar(20), subscription.planCode)
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("period", sql.Char(7), period)
      .query(`SELECT f.Code AS code, f.Nombre AS name, f.Medida AS measure,
                     pf.Habilitada AS enabled, pf.LimiteCuota AS quota,
                     COALESCE(usage.Cantidad, 0) AS used
              FROM PlanFeatures pf
              JOIN Features f ON f.Code=pf.FeatureCode
              LEFT JOIN UsageCounters usage ON usage.FeatureCode=pf.FeatureCode
                AND usage.IdOrganizacion=@organizationId AND usage.Periodo=@period
              WHERE pf.PlanCode=@planCode ORDER BY f.Code`);
    return {
      subscription,
      period,
      features: result.recordset.map((row) => ({
        code: row.code, name: row.name, measure: row.measure,
        enabled: active && Boolean(row.enabled), quota: row.quota, used: row.used,
        remaining: row.quota == null ? null : Math.max(0, row.quota - row.used),
      })),
    };
  }

  async consume(actor, featureCode, amount) {
    const snapshot = await this.entitlements(actor);
    const feature = snapshot.features.find((item) => item.code === featureCode);
    if (!feature?.enabled) return { outcome: "disabled", feature };
    if (feature.quota != null && feature.used + amount > feature.quota) {
      return { outcome: "quota_exceeded", feature };
    }
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const result = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("featureCode", sql.VarChar(80), featureCode)
        .input("period", sql.Char(7), snapshot.period)
        .input("amount", sql.Int, amount)
        .input("quota", sql.Int, feature.quota)
        .query(`MERGE UsageCounters WITH (HOLDLOCK) AS target
                USING (SELECT @organizationId AS IdOrganizacion, @featureCode AS FeatureCode,
                              @period AS Periodo) AS source
                ON target.IdOrganizacion=source.IdOrganizacion
                  AND target.FeatureCode=source.FeatureCode AND target.Periodo=source.Periodo
                WHEN MATCHED AND (@quota IS NULL OR target.Cantidad + @amount <= @quota)
                  THEN UPDATE SET Cantidad=Cantidad+@amount, FechaActualizacion=SYSUTCDATETIME()
                WHEN NOT MATCHED AND (@quota IS NULL OR @amount <= @quota)
                  THEN INSERT (IdOrganizacion, FeatureCode, Periodo, Cantidad)
                       VALUES (@organizationId, @featureCode, @period, @amount)
                OUTPUT inserted.Cantidad AS used;`);
      if (!result.recordset[0]) {
        await transaction.rollback();
        return { outcome: "quota_exceeded", feature };
      }
      await transaction.commit();
      const used = result.recordset[0].used;
      return { outcome: "consumed", feature: { ...feature, used, remaining: feature.quota == null ? null : feature.quota - used } };
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async addEvent(transaction, eventType, aggregateId, actor, data) {
    await new sql.Request(transaction)
      .input("eventType", sql.NVarChar(160), eventType)
      .input("aggregateId", sql.UniqueIdentifier, aggregateId)
      .input("payload", sql.NVarChar(sql.MAX), eventPayload(eventType, aggregateId, actor, data))
      .query("INSERT INTO OutboxMessages (EventType, AggregateId, Payload) VALUES (@eventType, @aggregateId, @payload)");
  }

  async addHistory(transaction, id, previousStatus, newStatus, previousPlan, newPlan, reason, actorId) {
    await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .input("previousStatus", sql.VarChar(20), previousStatus)
      .input("newStatus", sql.VarChar(20), newStatus)
      .input("previousPlan", sql.VarChar(20), previousPlan)
      .input("newPlan", sql.VarChar(20), newPlan)
      .input("reason", sql.NVarChar(500), reason)
      .input("actorId", sql.Int, actorId)
      .query(`INSERT INTO SubscriptionStatusHistory
        (IdSubscription, PreviousStatus, NewStatus, PreviousPlanCode, NewPlanCode, Reason, ChangedBy)
        VALUES (@id, @previousStatus, @newStatus, @previousPlan, @newPlan, @reason, @actorId)`);
  }
}

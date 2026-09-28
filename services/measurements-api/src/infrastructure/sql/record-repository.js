import { config } from "../../config.js";
import { database, sql } from "./database.js";

function json(value, fallback = {}) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function number(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patientId,
    title: row.title,
    status: row.status,
    method: row.method,
    equipment: row.equipment,
    protocol: row.protocol,
    notes: row.notes,
    recordedAt: row.recordedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const sessionSelect = `
  SELECT ${config.idColumn} AS id, IdPaciente AS patientId, Titulo AS title,
         Estado AS status, Metodo AS method, Equipo AS equipment,
         Protocolo AS protocol, Observaciones AS notes, FechaMedicion AS recordedAt,
         Version AS version, FechaCreacion AS createdAt, FechaActualizacion AS updatedAt
  FROM ${config.table}`;

export class SqlRecordRepository {
  async list(actor, patientId) {
    const pool = await database();
    const request = pool.request().input("organizationId", sql.UniqueIdentifier, actor.organizationId);
    let filter = "";
    if (patientId) {
      request.input("patientId", sql.UniqueIdentifier, patientId);
      filter = " AND IdPaciente=@patientId";
    }
    const result = await request.query(`${sessionSelect}
      WHERE IdOrganizacion=@organizationId${filter}
      ORDER BY FechaMedicion DESC`);
    return result.recordset.map(mapSession);
  }

  async get(actor, id) {
    const pool = await database();
    const request = () => pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id);
    const [sessionResult, measurementResult, vitalResult, advancedResult, bodyCompositionResult, panelResult, labResult, calculationResult] = await Promise.all([
      request().query(`${sessionSelect} WHERE IdOrganizacion=@organizationId AND ${config.idColumn}=@id`),
      request().query(`SELECT IdAnthropometricMeasurement AS id, Tipo AS type,
                              Valor AS value, Unidad AS unit, Lado AS side,
                              Metodo AS method, Equipo AS equipment, FechaCreacion AS createdAt
                       FROM AnthropometricMeasurements
                       WHERE IdOrganizacion=@organizationId AND IdMeasurementSession=@id
                       ORDER BY Tipo, Lado`),
      request().query(`SELECT IdVitalSign AS id, Tipo AS type, NombrePersonalizado AS name,
                              Valor AS value, Unidad AS unit, Metodo AS method,
                              Equipo AS equipment, FechaCreacion AS createdAt
                       FROM VitalSigns
                       WHERE IdOrganizacion=@organizationId AND IdMeasurementSession=@id
                       ORDER BY Tipo`),
      request().query(`SELECT IdAdvancedMeasurement AS id, Category AS category,
                              MeasurementCode AS code, Value AS value, Unit AS unit,
                              Side AS side, Method AS method, Equipment AS equipment,
                              CreatedAt AS createdAt
                       FROM AdvancedAnthropometricMeasurements
                       WHERE IdOrganizacion=@organizationId AND IdMeasurementSession=@id
                       ORDER BY Category, MeasurementCode, Side`),
      request().query(`SELECT IdBodyCompositionResult AS id, IndicatorCode AS indicator,
                              CustomName AS name, Value AS value, Unit AS unit,
                              Method AS method, Equipment AS equipment,
                              FormulaCode AS formulaCode, FormulaVersion AS formulaVersion,
                              FormulaSource AS formulaSource, Inputs AS inputs,
                              Notes AS notes, CreatedAt AS createdAt
                       FROM BodyCompositionResults
                       WHERE IdOrganizacion=@organizationId AND IdMeasurementSession=@id
                       ORDER BY IndicatorCode, CustomName`),
      request().query(`SELECT IdLabPanel AS id, Nombre AS name, Laboratorio AS laboratory,
                              FechaMuestra AS sampleDate, Observaciones AS notes,
                              FechaCreacion AS createdAt
                       FROM LabPanels
                       WHERE IdOrganizacion=@organizationId AND IdMeasurementSession=@id
                       ORDER BY FechaMuestra`),
      request().query(`SELECT results.IdLabResult AS id, results.IdLabPanel AS panelId,
                              results.Parametro AS parameter, results.Resultado AS result,
                              results.Unidad AS unit, results.ReferenciaInferior AS referenceLow,
                              results.ReferenciaSuperior AS referenceHigh, results.Bandera AS flag,
                              results.Observaciones AS notes
                       FROM LabResults results
                       JOIN LabPanels panels ON panels.IdLabPanel=results.IdLabPanel
                       WHERE panels.IdOrganizacion=@organizationId
                         AND panels.IdMeasurementSession=@id
                       ORDER BY results.Parametro`),
      request().query(`SELECT IdCalculationResult AS id, FormulaCode AS formulaCode,
                              FormulaVersion AS formulaVersion, Inputs AS inputs,
                              Resultado AS result, Unidad AS unit, Redondeo AS rounding,
                              FechaCreacion AS createdAt
                       FROM CalculationResults
                       WHERE IdOrganizacion=@organizationId AND IdMeasurementSession=@id
                       ORDER BY FormulaCode`),
    ]);
    const session = mapSession(sessionResult.recordset[0]);
    if (!session) return null;
    const resultsByPanel = Map.groupBy(labResult.recordset, (item) => String(item.panelId));
    return {
      ...session,
      measurements: measurementResult.recordset.map((item) => ({ ...item, value: number(item.value) })),
      advancedMeasurements: advancedResult.recordset.map((item) => ({ ...item, value: number(item.value) })),
      bodyComposition: bodyCompositionResult.recordset.map((item) => ({
        ...item,
        value: number(item.value),
        inputs: item.inputs ? json(item.inputs) : null,
      })),
      vitalSigns: vitalResult.recordset.map((item) => ({ ...item, value: number(item.value) })),
      labPanels: panelResult.recordset.map((panel) => ({
        ...panel,
        results: (resultsByPanel.get(String(panel.id)) || []).map((item) => ({
          ...item,
          result: number(item.result),
          referenceLow: number(item.referenceLow),
          referenceHigh: number(item.referenceHigh),
        })),
      })),
      calculations: calculationResult.recordset.map((item) => ({
        ...item,
        inputs: json(item.inputs),
        result: number(item.result),
      })),
    };
  }

  async create(actor, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const id = await this.insertSession(transaction, actor, input);
      await this.addEvent(transaction, "measurements.session.recorded.v1", id, actor, {
        patientId: input.patientId,
        recordedAt: input.recordedAt || new Date().toISOString(),
        measurementTypes: input.measurements.map((item) => item.type),
        advancedMeasurementTypes: input.advancedMeasurements.map((item) => `${item.category}:${item.code}`),
        bodyCompositionTypes: input.bodyComposition.map((item) => item.indicator),
        calculationTypes: input.calculations.map((item) => item.formulaCode),
      });
      await transaction.commit();
      return this.get(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async comparison(actor, patientId) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("patientId", sql.UniqueIdentifier, patientId)
      .query(`WITH Metrics AS (
                SELECT measurements.Tipo AS metric, measurements.Unidad AS unit,
                       measurements.Valor AS value, sessions.FechaMedicion AS recordedAt,
                       sessions.IdMeasurementSession AS sessionId
                FROM AnthropometricMeasurements measurements
                JOIN MeasurementSessions sessions
                  ON sessions.IdMeasurementSession=measurements.IdMeasurementSession
                WHERE measurements.IdOrganizacion=@organizationId
                  AND measurements.IdPaciente=@patientId AND sessions.Estado='recorded'
                UNION ALL
                SELECT calculations.FormulaCode, calculations.Unidad, calculations.Resultado,
                       sessions.FechaMedicion, sessions.IdMeasurementSession
                FROM CalculationResults calculations
                JOIN MeasurementSessions sessions
                  ON sessions.IdMeasurementSession=calculations.IdMeasurementSession
                WHERE calculations.IdOrganizacion=@organizationId
                  AND calculations.IdPaciente=@patientId AND sessions.Estado='recorded'
                UNION ALL
                SELECT CONCAT(advanced.Category, ':', advanced.MeasurementCode,
                              COALESCE(CONCAT(':', advanced.Side), '')),
                       advanced.Unit, advanced.Value, sessions.FechaMedicion,
                       sessions.IdMeasurementSession
                FROM AdvancedAnthropometricMeasurements advanced
                JOIN MeasurementSessions sessions
                  ON sessions.IdMeasurementSession=advanced.IdMeasurementSession
                WHERE advanced.IdOrganizacion=@organizationId
                  AND advanced.IdPaciente=@patientId AND sessions.Estado='recorded'
                UNION ALL
                SELECT CONCAT('body_composition:', body.IndicatorCode,
                              COALESCE(CONCAT(':', body.CustomName), '')),
                       body.Unit, body.Value, sessions.FechaMedicion,
                       sessions.IdMeasurementSession
                FROM BodyCompositionResults body
                JOIN MeasurementSessions sessions
                  ON sessions.IdMeasurementSession=body.IdMeasurementSession
                WHERE body.IdOrganizacion=@organizationId
                  AND body.IdPaciente=@patientId AND sessions.Estado='recorded'
              ), Ranked AS (
                SELECT *,
                       ROW_NUMBER() OVER (PARTITION BY metric, unit ORDER BY recordedAt, sessionId) AS firstRank,
                       ROW_NUMBER() OVER (PARTITION BY metric, unit ORDER BY recordedAt DESC, sessionId DESC) AS lastRank
                FROM Metrics
              )
              SELECT initial.metric, initial.unit,
                     initial.value AS initialValue, initial.recordedAt AS initialAt,
                     initial.sessionId AS initialSessionId,
                     latest.value AS currentValue, latest.recordedAt AS currentAt,
                     latest.sessionId AS currentSessionId
              FROM Ranked initial
              JOIN Ranked latest ON latest.metric=initial.metric AND latest.unit=initial.unit
              WHERE initial.firstRank=1 AND latest.lastRank=1
              ORDER BY initial.metric`);
    return result.recordset.map((row) => ({
      ...row,
      initialValue: number(row.initialValue),
      currentValue: number(row.currentValue),
    }));
  }

  async importLegacy(actor, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const existing = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("source", sql.NVarChar(120), input.source)
        .input("legacyKey", sql.NVarChar(160), input.legacyKey)
        .query(`SELECT IdLegacyMeasurementImport AS id, IdMeasurementSession AS sessionId
                FROM LegacyMeasurementImports
                WHERE IdOrganizacion=@organizationId AND Origen=@source AND LegacyKey=@legacyKey`);
      if (existing.recordset[0]) {
        await transaction.rollback();
        return { imported: false, ...existing.recordset[0] };
      }
      const measurements = [
        ...(input.weightKg === null ? [] : [{
          type: "weight", value: input.weightKg, unit: "kg", side: null, method: input.source, equipment: null,
        }]),
        ...(input.heightCm === null ? [] : [{
          type: "height", value: input.heightCm, unit: "cm", side: null, method: input.source, equipment: null,
        }]),
      ];
      const sessionId = await this.insertSession(transaction, actor, {
        patientId: input.patientId,
        title: "Medición migrada desde Patients",
        recordedAt: input.recordedAt || undefined,
        method: input.source,
        equipment: null,
        protocol: "legacy-import",
        notes: `Importación ${input.legacyKey}`,
        measurements,
        vitalSigns: [],
        labPanels: [],
        calculations: input.calculations,
      });
      const imported = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("legacyKey", sql.NVarChar(160), input.legacyKey)
        .input("weightKg", sql.Decimal(18, 6), input.weightKg)
        .input("heightCm", sql.Decimal(18, 6), input.heightCm)
        .input("recordedAt", sql.DateTime2, input.recordedAt ? new Date(input.recordedAt) : null)
        .input("source", sql.NVarChar(120), input.source)
        .input("sessionId", sql.UniqueIdentifier, sessionId)
        .query(`INSERT INTO LegacyMeasurementImports
                  (IdOrganizacion, IdPaciente, LegacyKey, PesoKg, AlturaCm,
                   FechaOrigen, Origen, IdMeasurementSession)
                OUTPUT INSERTED.IdLegacyMeasurementImport AS id
                VALUES (@organizationId, @patientId, @legacyKey, @weightKg, @heightCm,
                        @recordedAt, @source, @sessionId)`);
      await this.addEvent(transaction, "measurements.session.recorded.v1", sessionId, actor, {
        patientId: input.patientId,
        legacyKey: input.legacyKey,
        source: input.source,
        migrated: true,
      });
      await transaction.commit();
      return { imported: true, id: imported.recordset[0].id, sessionId };
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async insertSession(transaction, actor, input) {
    const inserted = await new sql.Request(transaction)
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("owner", sql.Int, actor.id)
      .input("patientId", sql.UniqueIdentifier, input.patientId)
      .input("title", sql.NVarChar(200), input.title)
      .input("recordedAt", sql.DateTime2, input.recordedAt ? new Date(input.recordedAt) : new Date())
      .input("method", sql.NVarChar(160), input.method)
      .input("equipment", sql.NVarChar(160), input.equipment)
      .input("protocol", sql.NVarChar(160), input.protocol)
      .input("notes", sql.NVarChar(1000), input.notes)
      .input("data", sql.NVarChar(sql.MAX), JSON.stringify({
        measurementCount: input.measurements.length,
        advancedMeasurementCount: (input.advancedMeasurements || []).length,
        bodyCompositionCount: (input.bodyComposition || []).length,
        vitalSignCount: input.vitalSigns.length,
        labPanelCount: input.labPanels.length,
      }))
      .query(`INSERT INTO MeasurementSessions
                (IdOrganizacion, IdNutricionista, IdPaciente, Titulo, Estado, Datos,
                 FechaMedicion, Metodo, Equipo, Protocolo, Observaciones)
              OUTPUT INSERTED.IdMeasurementSession AS id
              VALUES (@organizationId, @owner, @patientId, @title, 'recorded', @data,
                      @recordedAt, @method, @equipment, @protocol, @notes)`);
    const id = inserted.recordset[0].id;
    for (const item of input.measurements) {
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("sessionId", sql.UniqueIdentifier, id)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("type", sql.VarChar(60), item.type)
        .input("value", sql.Decimal(18, 6), item.value)
        .input("unit", sql.VarChar(30), item.unit)
        .input("side", sql.VarChar(20), item.side || null)
        .input("method", sql.NVarChar(160), item.method || input.method)
        .input("equipment", sql.NVarChar(160), item.equipment || input.equipment)
        .input("owner", sql.Int, actor.id)
        .query(`INSERT INTO AnthropometricMeasurements
                  (IdOrganizacion, IdMeasurementSession, IdPaciente, Tipo, Valor,
                   Unidad, Lado, Metodo, Equipo, CreadoPor)
                VALUES (@organizationId, @sessionId, @patientId, @type, @value,
                        @unit, @side, @method, @equipment, @owner)`);
    }
    for (const item of input.advancedMeasurements || []) {
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("sessionId", sql.UniqueIdentifier, id)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("category", sql.VarChar(30), item.category)
        .input("code", sql.VarChar(80), item.code)
        .input("value", sql.Decimal(18, 6), item.value)
        .input("unit", sql.VarChar(20), item.unit)
        .input("side", sql.VarChar(20), item.side)
        .input("method", sql.NVarChar(160), item.method || input.method)
        .input("equipment", sql.NVarChar(160), item.equipment || input.equipment)
        .input("owner", sql.Int, actor.id)
        .query(`INSERT INTO AdvancedAnthropometricMeasurements
          (IdOrganizacion, IdMeasurementSession, IdPaciente, Category,
           MeasurementCode, Value, Unit, Side, Method, Equipment, CreatedBy)
          VALUES (@organizationId, @sessionId, @patientId, @category,
                  @code, @value, @unit, @side, @method, @equipment, @owner)`);
    }
    for (const item of input.bodyComposition || []) {
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("sessionId", sql.UniqueIdentifier, id)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("indicator", sql.VarChar(80), item.indicator)
        .input("name", sql.NVarChar(160), item.name)
        .input("value", sql.Decimal(18, 6), item.value)
        .input("unit", sql.VarChar(20), item.unit)
        .input("method", sql.NVarChar(160), item.method)
        .input("equipment", sql.NVarChar(160), item.equipment)
        .input("formulaCode", sql.VarChar(80), item.formulaCode)
        .input("formulaVersion", sql.VarChar(30), item.formulaVersion)
        .input("formulaSource", sql.NVarChar(500), item.formulaSource)
        .input("inputs", sql.NVarChar(sql.MAX), item.inputs ? JSON.stringify(item.inputs) : null)
        .input("notes", sql.NVarChar(500), item.notes)
        .input("owner", sql.Int, actor.id)
        .query(`INSERT INTO BodyCompositionResults
          (IdOrganizacion, IdMeasurementSession, IdPaciente, IndicatorCode,
           CustomName, Value, Unit, Method, Equipment, FormulaCode, FormulaVersion,
           FormulaSource, Inputs, Notes, CreatedBy)
          VALUES (@organizationId, @sessionId, @patientId, @indicator,
                  @name, @value, @unit, @method, @equipment, @formulaCode,
                  @formulaVersion, @formulaSource, @inputs, @notes, @owner)`);
    }
    for (const item of input.vitalSigns) {
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("sessionId", sql.UniqueIdentifier, id)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("type", sql.VarChar(60), item.type)
        .input("name", sql.NVarChar(120), item.name)
        .input("value", sql.Decimal(18, 6), item.value)
        .input("unit", sql.VarChar(30), item.unit)
        .input("method", sql.NVarChar(160), item.method || input.method)
        .input("equipment", sql.NVarChar(160), item.equipment || input.equipment)
        .input("owner", sql.Int, actor.id)
        .query(`INSERT INTO VitalSigns
                  (IdOrganizacion, IdMeasurementSession, IdPaciente, Tipo,
                   NombrePersonalizado, Valor, Unidad, Metodo, Equipo, CreadoPor)
                VALUES (@organizationId, @sessionId, @patientId, @type,
                        @name, @value, @unit, @method, @equipment, @owner)`);
    }
    for (const panel of input.labPanels) {
      const insertedPanel = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("sessionId", sql.UniqueIdentifier, id)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("name", sql.NVarChar(200), panel.name)
        .input("laboratory", sql.NVarChar(200), panel.laboratory)
        .input("sampleDate", sql.DateTime2, new Date(panel.sampleDate))
        .input("notes", sql.NVarChar(1000), panel.notes)
        .input("owner", sql.Int, actor.id)
        .query(`INSERT INTO LabPanels
                  (IdOrganizacion, IdMeasurementSession, IdPaciente, Nombre,
                   Laboratorio, FechaMuestra, Observaciones, CreadoPor)
                OUTPUT INSERTED.IdLabPanel AS id
                VALUES (@organizationId, @sessionId, @patientId, @name,
                        @laboratory, @sampleDate, @notes, @owner)`);
      const panelId = insertedPanel.recordset[0].id;
      for (const result of panel.results) {
        const flag = result.referenceLow !== null && result.result < result.referenceLow
          ? "low"
          : result.referenceHigh !== null && result.result > result.referenceHigh
            ? "high"
            : result.referenceLow !== null || result.referenceHigh !== null ? "normal" : null;
        await new sql.Request(transaction)
          .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
          .input("panelId", sql.UniqueIdentifier, panelId)
          .input("parameter", sql.NVarChar(160), result.parameter)
          .input("result", sql.Decimal(18, 6), result.result)
          .input("unit", sql.NVarChar(40), result.unit)
          .input("referenceLow", sql.Decimal(18, 6), result.referenceLow)
          .input("referenceHigh", sql.Decimal(18, 6), result.referenceHigh)
          .input("flag", sql.VarChar(20), flag)
          .input("notes", sql.NVarChar(500), result.notes)
          .query(`INSERT INTO LabResults
                    (IdOrganizacion, IdLabPanel, Parametro, Resultado, Unidad,
                     ReferenciaInferior, ReferenciaSuperior, Bandera, Observaciones)
                  VALUES (@organizationId, @panelId, @parameter, @result, @unit,
                          @referenceLow, @referenceHigh, @flag, @notes)`);
      }
    }
    for (const calculation of input.calculations) {
      await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("sessionId", sql.UniqueIdentifier, id)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("formulaCode", sql.VarChar(80), calculation.formulaCode)
        .input("formulaVersion", sql.VarChar(30), calculation.formulaVersion)
        .input("inputs", sql.NVarChar(sql.MAX), JSON.stringify(calculation.inputs))
        .input("result", sql.Decimal(18, 6), calculation.result)
        .input("unit", sql.VarChar(30), calculation.unit)
        .input("rounding", sql.Int, calculation.rounding)
        .input("owner", sql.Int, actor.id)
        .query(`INSERT INTO CalculationResults
                  (IdOrganizacion, IdMeasurementSession, IdPaciente, FormulaCode,
                   FormulaVersion, Inputs, Resultado, Unidad, Redondeo, CreadoPor)
                VALUES (@organizationId, @sessionId, @patientId, @formulaCode,
                        @formulaVersion, @inputs, @result, @unit, @rounding, @owner)`);
    }
    return id;
  }

  async createEvaluator(actor, input) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("owner", sql.Int, actor.id)
      .input("name", sql.NVarChar(200), input.displayName)
      .input("level", sql.TinyInt, input.isakLevel)
      .input("code", sql.NVarChar(100), input.accreditationCode)
      .query(`INSERT INTO SportEvaluators
        (IdOrganizacion, IdUsuario, DisplayName, IsakLevel, AccreditationCode)
        OUTPUT INSERTED.IdSportEvaluator AS id, INSERTED.DisplayName AS displayName,
               INSERTED.IsakLevel AS isakLevel, INSERTED.AccreditationCode AS accreditationCode
        VALUES (@organizationId, @owner, @name, @level, @code)`);
    return result.recordset[0];
  }

  async createSport(actor, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const evaluator = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("evaluatorId", sql.UniqueIdentifier, input.evaluatorId)
        .query(`SELECT IsakLevel AS level FROM SportEvaluators
          WHERE IdOrganizacion=@organizationId AND IdSportEvaluator=@evaluatorId AND Active=1`);
      const level = evaluator.recordset[0]?.level;
      const requiredLevel = input.protocolCode === "ISAK_2" ? 2 : 1;
      if (!level || level < requiredLevel) {
        await transaction.rollback();
        return { invalidEvaluator: true };
      }
      const inserted = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("patientId", sql.UniqueIdentifier, input.patientId)
        .input("evaluatorId", sql.UniqueIdentifier, input.evaluatorId)
        .input("protocol", sql.VarChar(30), input.protocolCode)
        .input("sport", sql.NVarChar(120), input.sport)
        .input("phase", sql.NVarChar(120), input.trainingPhase)
        .input("assessedAt", sql.DateTime2, new Date(input.assessedAt))
        .input("notes", sql.NVarChar(1000), input.notes)
        .input("owner", sql.Int, actor.id)
        .query(`INSERT INTO SportAssessments
          (IdOrganizacion, IdPaciente, IdSportEvaluator, ProtocolCode, Sport,
           TrainingPhase, AssessedAt, Notes, CreatedBy)
          OUTPUT INSERTED.IdSportAssessment AS id
          VALUES (@organizationId, @patientId, @evaluatorId, @protocol, @sport,
                  @phase, @assessedAt, @notes, @owner)`);
      const id = inserted.recordset[0].id;
      for (const measurement of input.measurements) {
        await new sql.Request(transaction)
          .input("id", sql.UniqueIdentifier, id)
          .input("category", sql.VarChar(30), measurement.category)
          .input("code", sql.VarChar(80), measurement.code)
          .input("value", sql.Decimal(18, 6), measurement.value)
          .input("unit", sql.VarChar(10), measurement.unit)
          .input("side", sql.VarChar(20), measurement.side)
          .input("equipment", sql.NVarChar(160), measurement.equipment)
          .query(`INSERT INTO SportMeasurements
            (IdSportAssessment, Category, MeasurementCode, Value, Unit, Side, Equipment)
            VALUES (@id, @category, @code, @value, @unit, @side, @equipment)`);
      }
      for (const calculation of input.calculations) {
        await new sql.Request(transaction)
          .input("id", sql.UniqueIdentifier, id)
          .input("code", sql.VarChar(80), calculation.formulaCode)
          .input("version", sql.VarChar(30), calculation.formulaVersion)
          .input("source", sql.NVarChar(500), calculation.source)
          .input("inputs", sql.NVarChar(sql.MAX), JSON.stringify(calculation.inputs))
          .input("result", sql.Decimal(18, 6), calculation.result)
          .input("unit", sql.VarChar(30), calculation.unit)
          .input("rounding", sql.TinyInt, calculation.rounding)
          .input("validation", sql.VarChar(30), calculation.validationStatus)
          .query(`INSERT INTO SportCalculationResults
            (IdSportAssessment, FormulaCode, FormulaVersion, Source, Inputs,
             Result, Unit, Rounding, ValidationStatus)
            VALUES (@id, @code, @version, @source, @inputs, @result, @unit, @rounding, @validation)`);
      }
      await this.addEvent(transaction, "measurements.sport.assessment.recorded.v1", id, actor, {
        patientId: input.patientId,
        protocolCode: input.protocolCode,
        sport: input.sport,
        calculationTypes: input.calculations.map((item) => item.formulaCode),
      });
      await transaction.commit();
      return this.getSport(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async getSport(actor, id) {
    const pool = await database();
    const base = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT assessments.IdSportAssessment AS id, assessments.IdPaciente AS patientId,
                     assessments.ProtocolCode AS protocolCode, assessments.Sport AS sport,
                     assessments.TrainingPhase AS trainingPhase, assessments.AssessedAt AS assessedAt,
                     assessments.Notes AS notes, evaluators.IdSportEvaluator AS evaluatorId,
                     evaluators.DisplayName AS evaluatorName, evaluators.IsakLevel AS evaluatorIsakLevel,
                     evaluators.AccreditationCode AS accreditationCode
              FROM SportAssessments assessments JOIN SportEvaluators evaluators
                ON evaluators.IdSportEvaluator=assessments.IdSportEvaluator
              WHERE assessments.IdOrganizacion=@organizationId AND assessments.IdSportAssessment=@id;
              SELECT Category AS category, MeasurementCode AS code, Value AS value,
                     Unit AS unit, Side AS side, Equipment AS equipment
              FROM SportMeasurements WHERE IdSportAssessment=@id ORDER BY Category, MeasurementCode;
              SELECT FormulaCode AS formulaCode, FormulaVersion AS formulaVersion,
                     Source AS source, Inputs AS inputs, Result AS result, Unit AS unit,
                     Rounding AS rounding, ValidationStatus AS validationStatus
              FROM SportCalculationResults WHERE IdSportAssessment=@id ORDER BY FormulaCode`);
    if (!base.recordsets[0][0]) return null;
    return {
      ...base.recordsets[0][0],
      measurements: base.recordsets[1].map((item) => ({ ...item, value: Number(item.value) })),
      calculations: base.recordsets[2].map((item) => ({
        ...item,
        inputs: JSON.parse(item.inputs),
        result: Number(item.result),
      })),
    };
  }

  async sportComparison(actor, patientId) {
    const pool = await database();
    const result = await pool.request()
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("patientId", sql.UniqueIdentifier, patientId)
      .query(`WITH Metrics AS (
          SELECT CONCAT(measurements.Category, ':', measurements.MeasurementCode, ':', measurements.Side) AS metric,
                 measurements.Unit AS unit, measurements.Value AS value,
                 assessments.AssessedAt AS recordedAt, assessments.IdSportAssessment AS assessmentId
          FROM SportMeasurements measurements JOIN SportAssessments assessments
            ON assessments.IdSportAssessment=measurements.IdSportAssessment
          WHERE assessments.IdOrganizacion=@organizationId AND assessments.IdPaciente=@patientId
          UNION ALL
          SELECT calculations.FormulaCode, calculations.Unit, calculations.Result,
                 assessments.AssessedAt, assessments.IdSportAssessment
          FROM SportCalculationResults calculations JOIN SportAssessments assessments
            ON assessments.IdSportAssessment=calculations.IdSportAssessment
          WHERE assessments.IdOrganizacion=@organizationId AND assessments.IdPaciente=@patientId
        ), Ranked AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY metric, unit ORDER BY recordedAt, assessmentId) AS firstRank,
                    ROW_NUMBER() OVER (PARTITION BY metric, unit ORDER BY recordedAt DESC, assessmentId DESC) AS lastRank
          FROM Metrics
        )
        SELECT initial.metric, initial.unit, initial.value AS initialValue,
               initial.recordedAt AS initialAt, initial.assessmentId AS initialSessionId,
               latest.value AS currentValue, latest.recordedAt AS currentAt,
               latest.assessmentId AS currentSessionId
        FROM Ranked initial JOIN Ranked latest
          ON latest.metric=initial.metric AND latest.unit=initial.unit
        WHERE initial.firstRank=1 AND latest.lastRank=1 ORDER BY initial.metric`);
    return result.recordset.map((row) => ({
      ...row,
      initialValue: Number(row.initialValue),
      currentValue: Number(row.currentValue),
    }));
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

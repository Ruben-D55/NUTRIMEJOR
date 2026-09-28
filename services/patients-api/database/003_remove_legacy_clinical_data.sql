IF COL_LENGTH('Pacientes', 'Peso') IS NOT NULL OR COL_LENGTH('Pacientes', 'Altura') IS NOT NULL
BEGIN
  DECLARE @WeightExpression NVARCHAR(40) = CASE
    WHEN COL_LENGTH('Pacientes', 'Peso') IS NOT NULL THEN N'patient.Peso'
    ELSE N'NULL'
  END;
  DECLARE @HeightExpression NVARCHAR(40) = CASE
    WHEN COL_LENGTH('Pacientes', 'Altura') IS NOT NULL THEN N'patient.Altura'
    ELSE N'NULL'
  END;
  DECLARE @LegacyMeasurementSql NVARCHAR(MAX) = N'
    INSERT INTO OutboxMessages (EventType, AggregateId, Payload)
    SELECT ''patients.legacy-measurements.exported.v1'', patient.IdPaciente,
      (
        SELECT NEWID() AS eventId,
          ''patients.legacy-measurements.exported.v1'' AS eventType,
          SYSUTCDATETIME() AS occurredAt, patient.IdOrganizacion AS organizationId,
          COALESCE(patient.CreadoPor, patient.IdNutricionista) AS actorId,
          patient.IdPaciente AS aggregateId,
          JSON_QUERY((
            SELECT ' + @WeightExpression + N' AS weightKg, ' + @HeightExpression + N' AS heightCm,
              patient.FechaActualizacion AS recordedAt, ''patients-db'' AS source
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
          )) AS data
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
      )
    FROM Pacientes patient
    WHERE ' + @WeightExpression + N' IS NOT NULL OR ' + @HeightExpression + N' IS NOT NULL;
  ';
  EXEC sp_executesql @LegacyMeasurementSql;

  IF COL_LENGTH('Pacientes', 'Peso') IS NOT NULL
    EXEC(N'ALTER TABLE Pacientes DROP COLUMN Peso');
  IF COL_LENGTH('Pacientes', 'Altura') IS NOT NULL
    EXEC(N'ALTER TABLE Pacientes DROP COLUMN Altura');
END;

IF OBJECT_ID('HistorialPaciente', 'U') IS NOT NULL
BEGIN
  EXEC(N'
    INSERT INTO OutboxMessages (EventType, AggregateId, Payload)
    SELECT ''patients.legacy-clinical-history.exported.v1'', history.IdPaciente,
      (
        SELECT NEWID() AS eventId,
          ''patients.legacy-clinical-history.exported.v1'' AS eventType,
          history.Fecha AS occurredAt, patient.IdOrganizacion AS organizationId,
          COALESCE(patient.CreadoPor, patient.IdNutricionista) AS actorId,
          history.IdPaciente AS aggregateId,
          JSON_QUERY((
            SELECT history.IdHistorial AS legacyHistoryId, history.Tipo AS type,
              history.Notas AS notes, history.Fecha AS recordedAt, ''patients-db'' AS source
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
          )) AS data
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
      )
    FROM HistorialPaciente history
    JOIN Pacientes patient ON patient.IdPaciente=history.IdPaciente;
  ');

  DROP TABLE HistorialPaciente;
END;

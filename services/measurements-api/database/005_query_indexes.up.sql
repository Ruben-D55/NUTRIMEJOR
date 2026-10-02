IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AnthropometricMeasurements_Session' AND object_id=OBJECT_ID('AnthropometricMeasurements'))
  CREATE INDEX IX_AnthropometricMeasurements_Session ON AnthropometricMeasurements (IdOrganizacion, IdMeasurementSession, Tipo, Lado);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_CalculationResults_Session' AND object_id=OBJECT_ID('CalculationResults'))
  CREATE INDEX IX_CalculationResults_Session ON CalculationResults (IdOrganizacion, IdMeasurementSession, FormulaCode);

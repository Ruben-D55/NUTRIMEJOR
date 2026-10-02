IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_CalculationResults_Session' AND object_id=OBJECT_ID('CalculationResults'))
  DROP INDEX IX_CalculationResults_Session ON CalculationResults;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AnthropometricMeasurements_Session' AND object_id=OBJECT_ID('AnthropometricMeasurements'))
  DROP INDEX IX_AnthropometricMeasurements_Session ON AnthropometricMeasurements;

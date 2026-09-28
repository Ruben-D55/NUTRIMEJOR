MERGE Features AS target
USING (VALUES
  ('measurements.advanced', N'Antropometría avanzada y composición corporal', NULL)
) AS source (Code, Nombre, Medida)
ON target.Code=source.Code
WHEN MATCHED THEN UPDATE SET Nombre=source.Nombre, Medida=source.Medida
WHEN NOT MATCHED THEN INSERT (Code, Nombre, Medida)
VALUES (source.Code, source.Nombre, source.Medida);

MERGE PlanFeatures AS target
USING (VALUES
  ('BASIC', 'measurements.advanced', 0, 0),
  ('PRO', 'measurements.advanced', 1, NULL),
  ('SPORT', 'measurements.advanced', 1, NULL)
) AS source (PlanCode, FeatureCode, Habilitada, LimiteCuota)
ON target.PlanCode=source.PlanCode AND target.FeatureCode=source.FeatureCode
WHEN MATCHED THEN UPDATE SET Habilitada=source.Habilitada, LimiteCuota=source.LimiteCuota
WHEN NOT MATCHED THEN INSERT (PlanCode, FeatureCode, Habilitada, LimiteCuota)
VALUES (source.PlanCode, source.FeatureCode, source.Habilitada, source.LimiteCuota);

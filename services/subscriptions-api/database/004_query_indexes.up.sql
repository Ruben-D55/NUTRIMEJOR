IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Plans_ActiveOrder' AND object_id=OBJECT_ID('Plans'))
  CREATE INDEX IX_Plans_ActiveOrder ON Plans (Activo, Orden) INCLUDE (Code, Nombre, Descripcion);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Subscriptions_StatusPeriod' AND object_id=OBJECT_ID('Subscriptions'))
  CREATE INDEX IX_Subscriptions_StatusPeriod ON Subscriptions (Estado, FinPeriodo) INCLUDE (IdOrganizacion, PlanCode, Version);

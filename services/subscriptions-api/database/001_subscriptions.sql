IF OBJECT_ID('Subscriptions', 'U') IS NOT NULL
  AND COL_LENGTH('Subscriptions', 'PlanCode') IS NULL
  AND OBJECT_ID('SubscriptionsLegacy', 'U') IS NULL
BEGIN
  EXEC sp_rename 'Subscriptions', 'SubscriptionsLegacy';
END;

IF OBJECT_ID('Plans', 'U') IS NULL
BEGIN
  CREATE TABLE Plans (
    Code VARCHAR(20) PRIMARY KEY,
    Nombre NVARCHAR(80) NOT NULL,
    Descripcion NVARCHAR(500) NOT NULL,
    Orden INT NOT NULL,
    Activo BIT NOT NULL DEFAULT 1
  );
END;

IF OBJECT_ID('Features', 'U') IS NULL
BEGIN
  CREATE TABLE Features (
    Code VARCHAR(80) PRIMARY KEY,
    Nombre NVARCHAR(120) NOT NULL,
    Medida VARCHAR(30) NULL
  );
END;

IF OBJECT_ID('PlanFeatures', 'U') IS NULL
BEGIN
  CREATE TABLE PlanFeatures (
    PlanCode VARCHAR(20) NOT NULL REFERENCES Plans(Code),
    FeatureCode VARCHAR(80) NOT NULL REFERENCES Features(Code),
    Habilitada BIT NOT NULL,
    LimiteCuota INT NULL,
    PRIMARY KEY (PlanCode, FeatureCode)
  );
END;

IF OBJECT_ID('Subscriptions', 'U') IS NULL
BEGIN
  CREATE TABLE Subscriptions (
    IdSubscription UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL UNIQUE,
    PlanCode VARCHAR(20) NOT NULL REFERENCES Plans(Code),
    Estado VARCHAR(20) NOT NULL
      CHECK (Estado IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
    Inicio DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FinPrueba DATETIME2 NULL,
    InicioPeriodo DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FinPeriodo DATETIME2 NOT NULL,
    Version INT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('UsageCounters', 'U') IS NULL
BEGIN
  CREATE TABLE UsageCounters (
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    FeatureCode VARCHAR(80) NOT NULL REFERENCES Features(Code),
    Periodo CHAR(7) NOT NULL,
    Cantidad INT NOT NULL DEFAULT 0 CHECK (Cantidad >= 0),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    PRIMARY KEY (IdOrganizacion, FeatureCode, Periodo)
  );
END;

IF OBJECT_ID('OutboxMessages', 'U') IS NULL
BEGIN
  CREATE TABLE OutboxMessages (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EventType NVARCHAR(160) NOT NULL,
    AggregateId UNIQUEIDENTIFIER NOT NULL,
    Payload NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Payload) = 1),
    OcurredAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    PublishedAt DATETIME2 NULL,
    Attempts INT NOT NULL DEFAULT 0
  );
  CREATE INDEX IX_OutboxMessages_Pending ON OutboxMessages (PublishedAt, OcurredAt);
END;

MERGE Plans AS target
USING (VALUES
  ('BASIC', N'Básica', N'Gestión clínica esencial para profesionales independientes.', 1),
  ('PRO', N'Pro', N'Automatización, análisis avanzado y mayor capacidad.', 2),
  ('SPORT', N'Sport', N'Funciones Pro más evaluación y planificación deportiva.', 3)
) AS source (Code, Nombre, Descripcion, Orden)
ON target.Code = source.Code
WHEN MATCHED THEN UPDATE SET Nombre=source.Nombre, Descripcion=source.Descripcion, Orden=source.Orden
WHEN NOT MATCHED THEN INSERT (Code, Nombre, Descripcion, Orden)
VALUES (source.Code, source.Nombre, source.Descripcion, source.Orden);

MERGE Features AS target
USING (VALUES
  ('patients.active', N'Pacientes activos', 'patients'),
  ('documents.pdf', N'Documentos PDF por mes', 'documents'),
  ('nutrition.recall24h', N'Recordatorio de 24 horas', NULL),
  ('nutrition.food_frequency', N'Frecuencia de consumo', NULL),
  ('planning.manual', N'Planes alimentarios manuales', NULL),
  ('planning.generator', N'Generaciones automáticas por mes', 'runs'),
  ('notifications.automation', N'Notificaciones automáticas', NULL),
  ('measurements.sport', N'Antropometría deportiva', NULL),
  ('planning.sport', N'Planificación deportiva', NULL)
) AS source (Code, Nombre, Medida)
ON target.Code = source.Code
WHEN MATCHED THEN UPDATE SET Nombre=source.Nombre, Medida=source.Medida
WHEN NOT MATCHED THEN INSERT (Code, Nombre, Medida)
VALUES (source.Code, source.Nombre, source.Medida);

MERGE PlanFeatures AS target
USING (VALUES
  ('BASIC', 'patients.active', 1, 50), ('BASIC', 'documents.pdf', 1, 10),
  ('BASIC', 'nutrition.recall24h', 1, NULL), ('BASIC', 'planning.manual', 1, NULL),
  ('BASIC', 'nutrition.food_frequency', 0, 0), ('BASIC', 'planning.generator', 0, 0),
  ('BASIC', 'notifications.automation', 0, 0), ('BASIC', 'measurements.sport', 0, 0),
  ('BASIC', 'planning.sport', 0, 0),
  ('PRO', 'patients.active', 1, 500), ('PRO', 'documents.pdf', 1, 100),
  ('PRO', 'nutrition.recall24h', 1, NULL), ('PRO', 'planning.manual', 1, NULL),
  ('PRO', 'nutrition.food_frequency', 1, NULL), ('PRO', 'planning.generator', 1, 30),
  ('PRO', 'notifications.automation', 1, NULL), ('PRO', 'measurements.sport', 0, 0),
  ('PRO', 'planning.sport', 0, 0),
  ('SPORT', 'patients.active', 1, NULL), ('SPORT', 'documents.pdf', 1, NULL),
  ('SPORT', 'nutrition.recall24h', 1, NULL), ('SPORT', 'planning.manual', 1, NULL),
  ('SPORT', 'nutrition.food_frequency', 1, NULL), ('SPORT', 'planning.generator', 1, NULL),
  ('SPORT', 'notifications.automation', 1, NULL), ('SPORT', 'measurements.sport', 1, NULL),
  ('SPORT', 'planning.sport', 1, NULL)
) AS source (PlanCode, FeatureCode, Habilitada, LimiteCuota)
ON target.PlanCode=source.PlanCode AND target.FeatureCode=source.FeatureCode
WHEN MATCHED THEN UPDATE SET Habilitada=source.Habilitada, LimiteCuota=source.LimiteCuota
WHEN NOT MATCHED THEN INSERT (PlanCode, FeatureCode, Habilitada, LimiteCuota)
VALUES (source.PlanCode, source.FeatureCode, source.Habilitada, source.LimiteCuota);

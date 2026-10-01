IF OBJECT_ID('NotificationJobs', 'U') IS NULL
BEGIN
  CREATE TABLE NotificationJobs (
    IdNotification UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NULL,
    IdNutricionista INT NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NULL,
    Titulo NVARCHAR(200) NOT NULL,
    Estado VARCHAR(30) NOT NULL DEFAULT 'draft',
    Datos NVARCHAR(MAX) NOT NULL DEFAULT '{}'
      CHECK (ISJSON(Datos) = 1),
    Version INT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_NotificationJobs_OwnerPatient
    ON NotificationJobs (IdNutricionista, IdPaciente, FechaActualizacion DESC);
END;

IF COL_LENGTH('NotificationJobs', 'IdOrganizacion') IS NULL
BEGIN
  ALTER TABLE NotificationJobs ADD IdOrganizacion UNIQUEIDENTIFIER NULL;
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

IF OBJECT_ID('InboxMessages', 'U') IS NULL
BEGIN
  CREATE TABLE InboxMessages (
    EventId UNIQUEIDENTIFIER PRIMARY KEY,
    MessageId NVARCHAR(200) NULL,
    EventType NVARCHAR(160) NOT NULL,
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NULL,
    AggregateId UNIQUEIDENTIFIER NOT NULL,
    DomainName VARCHAR(60) NOT NULL,
    OccurredAt DATETIME2 NOT NULL,
    Payload NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Payload) = 1),
    ProcessedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE UNIQUE INDEX UX_InboxMessages_MessageId ON InboxMessages (MessageId) WHERE MessageId IS NOT NULL;
  CREATE INDEX IX_InboxMessages_OrganizationDate ON InboxMessages (IdOrganizacion, OccurredAt DESC);
END;

IF OBJECT_ID('PatientActivity', 'U') IS NULL
BEGIN
  CREATE TABLE PatientActivity (
    EventId UNIQUEIDENTIFIER PRIMARY KEY,
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    DomainName VARCHAR(60) NOT NULL,
    EventType NVARCHAR(160) NOT NULL,
    AggregateId UNIQUEIDENTIFIER NOT NULL,
    OccurredAt DATETIME2 NOT NULL,
    Summary NVARCHAR(300) NOT NULL,
    Details NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Details) = 1)
  );
  CREATE INDEX IX_PatientActivity_Timeline
    ON PatientActivity (IdOrganizacion, IdPaciente, OccurredAt DESC);
END;

IF OBJECT_ID('OrganizationDailyMetrics', 'U') IS NULL
BEGIN
  CREATE TABLE OrganizationDailyMetrics (
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    MetricDate DATE NOT NULL,
    DomainName VARCHAR(60) NOT NULL,
    EventType NVARCHAR(160) NOT NULL,
    EventCount INT NOT NULL DEFAULT 0,
    LastEventAt DATETIME2 NOT NULL,
    CONSTRAINT PK_OrganizationDailyMetrics
      PRIMARY KEY (IdOrganizacion, MetricDate, DomainName, EventType)
  );
END;

IF OBJECT_ID('PatientDomainState', 'U') IS NULL
BEGIN
  CREATE TABLE PatientDomainState (
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    DomainName VARCHAR(60) NOT NULL,
    EventCount INT NOT NULL DEFAULT 0,
    LastEventType NVARCHAR(160) NOT NULL,
    LastAggregateId UNIQUEIDENTIFIER NOT NULL,
    LastEventAt DATETIME2 NOT NULL,
    CONSTRAINT PK_PatientDomainState
      PRIMARY KEY (IdOrganizacion, IdPaciente, DomainName)
  );
END;

IF COL_LENGTH('NotificationJobs', 'Channel') IS NULL
BEGIN
  ALTER TABLE NotificationJobs ADD
    SourceEventId UNIQUEIDENTIFIER NULL,
    TemplateCode VARCHAR(80) NULL,
    Channel VARCHAR(30) NULL,
    Recipient NVARCHAR(320) NULL,
    Subject NVARCHAR(300) NULL,
    Body NVARCHAR(MAX) NULL,
    ScheduledAt DATETIME2 NULL,
    NextAttemptAt DATETIME2 NULL,
    MaxAttempts SMALLINT NOT NULL DEFAULT 3,
    AttemptCount SMALLINT NOT NULL DEFAULT 0,
    DeliveredAt DATETIME2 NULL,
    LastError NVARCHAR(1000) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_NotificationJobs_SourceChannel')
  EXEC(N'CREATE UNIQUE INDEX UX_NotificationJobs_SourceChannel
    ON NotificationJobs (IdOrganizacion, SourceEventId, Channel, Recipient)
    WHERE SourceEventId IS NOT NULL');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_NotificationJobs_Dispatch')
  EXEC(N'CREATE INDEX IX_NotificationJobs_Dispatch
    ON NotificationJobs (Estado, NextAttemptAt, AttemptCount)');

IF OBJECT_ID('NotificationPreferences', 'U') IS NULL
BEGIN
  CREATE TABLE NotificationPreferences (
    IdNotificationPreference UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    Channel VARCHAR(30) NOT NULL,
    Recipient NVARCHAR(320) NOT NULL,
    Enabled BIT NOT NULL DEFAULT 1,
    ReminderMinutes INT NOT NULL DEFAULT 1440 CHECK (ReminderMinutes BETWEEN 0 AND 43200),
    UpdatedBy INT NOT NULL,
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UX_NotificationPreferences UNIQUE (IdOrganizacion, IdPaciente, Channel)
  );
END;

IF OBJECT_ID('NotificationInbox', 'U') IS NULL
BEGIN
  CREATE TABLE NotificationInbox (
    EventId UNIQUEIDENTIFIER PRIMARY KEY,
    EventType NVARCHAR(160) NOT NULL,
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    AggregateId UNIQUEIDENTIFIER NOT NULL,
    Payload NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Payload)=1),
    ProcessedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('NotificationDeliveryAttempts', 'U') IS NULL
BEGIN
  CREATE TABLE NotificationDeliveryAttempts (
    IdDeliveryAttempt UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdNotification UNIQUEIDENTIFIER NOT NULL,
    AttemptNumber SMALLINT NOT NULL,
    StartedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FinishedAt DATETIME2 NULL,
    Status VARCHAR(30) NOT NULL,
    ProviderMessageId NVARCHAR(200) NULL,
    ErrorMessage NVARCHAR(1000) NULL,
    CONSTRAINT FK_NotificationDeliveryAttempts_Job
      FOREIGN KEY (IdNotification) REFERENCES NotificationJobs(IdNotification)
  );
END;

IF OBJECT_ID('NotificationDeadLetters', 'U') IS NULL
BEGIN
  CREATE TABLE NotificationDeadLetters (
    IdDeadLetter UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdNotification UNIQUEIDENTIFIER NOT NULL UNIQUE,
    FailedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    Reason NVARCHAR(1000) NOT NULL,
    Snapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Snapshot)=1),
    CONSTRAINT FK_NotificationDeadLetters_Job
      FOREIGN KEY (IdNotification) REFERENCES NotificationJobs(IdNotification)
  );
END;

IF COL_LENGTH('Appointments', 'StartsAt') IS NULL
BEGIN
  ALTER TABLE Appointments ADD
    StartsAt DATETIME2 NULL,
    EndsAt DATETIME2 NULL,
    AppointmentType VARCHAR(40) NULL,
    TimeZone NVARCHAR(80) NULL,
    Location NVARCHAR(300) NULL,
    Notes NVARCHAR(2000) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Appointments_Calendar')
  CREATE INDEX IX_Appointments_Calendar
    ON Appointments (IdOrganizacion, IdNutricionista, StartsAt, EndsAt, Estado);

IF OBJECT_ID('AvailabilityRules', 'U') IS NULL
BEGIN
  CREATE TABLE AvailabilityRules (
    IdAvailabilityRule UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdNutricionista INT NOT NULL,
    Weekday TINYINT NOT NULL CHECK (Weekday BETWEEN 0 AND 6),
    StartTime TIME NOT NULL,
    EndTime TIME NOT NULL,
    TimeZone NVARCHAR(80) NOT NULL,
    SlotMinutes SMALLINT NOT NULL CHECK (SlotMinutes BETWEEN 5 AND 480),
    Active BIT NOT NULL DEFAULT 1,
    CONSTRAINT CK_AvailabilityRules_Time CHECK (StartTime < EndTime)
  );
  CREATE INDEX IX_AvailabilityRules_Owner
    ON AvailabilityRules (IdOrganizacion, IdNutricionista, Weekday, Active);
END;

IF OBJECT_ID('AvailabilityExceptions', 'U') IS NULL
BEGIN
  CREATE TABLE AvailabilityExceptions (
    IdAvailabilityException UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdNutricionista INT NOT NULL,
    StartsAt DATETIME2 NOT NULL,
    EndsAt DATETIME2 NOT NULL,
    Available BIT NOT NULL,
    Reason NVARCHAR(300) NULL,
    CONSTRAINT CK_AvailabilityExceptions_Time CHECK (StartsAt < EndsAt)
  );
  CREATE INDEX IX_AvailabilityExceptions_OwnerDate
    ON AvailabilityExceptions (IdOrganizacion, IdNutricionista, StartsAt, EndsAt);
END;

IF OBJECT_ID('AppointmentStatusHistory', 'U') IS NULL
BEGIN
  CREATE TABLE AppointmentStatusHistory (
    IdAppointmentStatusHistory UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdAppointment UNIQUEIDENTIFIER NOT NULL,
    PreviousStatus VARCHAR(30) NULL,
    NewStatus VARCHAR(30) NOT NULL,
    Reason NVARCHAR(500) NULL,
    ChangedBy INT NOT NULL,
    ChangedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_AppointmentStatusHistory_Appointment
      FOREIGN KEY (IdAppointment) REFERENCES Appointments(IdAppointment)
  );
  CREATE INDEX IX_AppointmentStatusHistory_Appointment
    ON AppointmentStatusHistory (IdOrganizacion, IdAppointment, ChangedAt);
END;

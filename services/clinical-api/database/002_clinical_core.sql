IF COL_LENGTH('Consultations', 'TipoConsulta') IS NULL
  ALTER TABLE Consultations ADD TipoConsulta VARCHAR(40) NOT NULL
    CONSTRAINT DF_Consultations_TipoConsulta DEFAULT 'initial';
IF COL_LENGTH('Consultations', 'FechaConsulta') IS NULL
  ALTER TABLE Consultations ADD FechaConsulta DATETIME2 NOT NULL
    CONSTRAINT DF_Consultations_FechaConsulta DEFAULT SYSUTCDATETIME();
IF COL_LENGTH('Consultations', 'PublicadoEn') IS NULL
  ALTER TABLE Consultations ADD PublicadoEn DATETIME2 NULL;
IF COL_LENGTH('Consultations', 'MotivoCorreccion') IS NULL
  ALTER TABLE Consultations ADD MotivoCorreccion NVARCHAR(500) NULL;
IF COL_LENGTH('Consultations', 'CorregidoDesdeVersion') IS NULL
  ALTER TABLE Consultations ADD CorregidoDesdeVersion INT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Consultations_OrganizationPatientDate')
  CREATE INDEX IX_Consultations_OrganizationPatientDate
    ON Consultations (IdOrganizacion, IdPaciente, FechaConsulta DESC);

IF OBJECT_ID('ClinicalRecords', 'U') IS NULL
BEGIN
  CREATE TABLE ClinicalRecords (
    IdClinicalRecord UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    CreadoPor INT NOT NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_ClinicalRecords_OrganizationPatient UNIQUE (IdOrganizacion, IdPaciente)
  );
END;

IF OBJECT_ID('ClinicalEntries', 'U') IS NULL
BEGIN
  CREATE TABLE ClinicalEntries (
    IdClinicalEntry UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdClinicalRecord UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    IdConsultation UNIQUEIDENTIFIER NULL,
    Categoria VARCHAR(40) NOT NULL,
    Titulo NVARCHAR(240) NOT NULL,
    Detalles NVARCHAR(MAX) NOT NULL DEFAULT '{}' CHECK (ISJSON(Detalles) = 1),
    Estado VARCHAR(30) NOT NULL DEFAULT 'active',
    FechaInicio DATETIME2 NULL,
    FechaFin DATETIME2 NULL,
    Origen NVARCHAR(120) NULL,
    CreadoPor INT NOT NULL,
    Version INT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ClinicalEntries_Record FOREIGN KEY (IdClinicalRecord)
      REFERENCES ClinicalRecords(IdClinicalRecord),
    CONSTRAINT CK_ClinicalEntries_Category CHECK (Categoria IN (
      'current_problem', 'personal_history', 'family_history', 'symptom', 'surgery',
      'medication', 'supplement', 'gynecological_history', 'clinical_note'
    ))
  );
  CREATE INDEX IX_ClinicalEntries_OrganizationPatient
    ON ClinicalEntries (IdOrganizacion, IdPaciente, Categoria, FechaActualizacion DESC);
END;

IF OBJECT_ID('ConsultationVersions', 'U') IS NULL
BEGIN
  CREATE TABLE ConsultationVersions (
    IdConsultationVersion UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdConsultation UNIQUEIDENTIFIER NOT NULL,
    VersionNumber INT NOT NULL,
    Snapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Snapshot) = 1),
    ChangeReason NVARCHAR(500) NOT NULL,
    ChangedBy INT NOT NULL,
    IsCorrection BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ConsultationVersions_Consultation FOREIGN KEY (IdConsultation)
      REFERENCES Consultations(IdConsultation),
    CONSTRAINT UQ_ConsultationVersions_Number UNIQUE (IdConsultation, VersionNumber)
  );
  CREATE INDEX IX_ConsultationVersions_OrganizationConsultation
    ON ConsultationVersions (IdOrganizacion, IdConsultation, VersionNumber DESC);
END;

IF OBJECT_ID('NutritionDiagnoses', 'U') IS NULL
BEGIN
  CREATE TABLE NutritionDiagnoses (
    IdNutritionDiagnosis UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdConsultation UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    Codigo NVARCHAR(60) NULL,
    Enunciado NVARCHAR(500) NOT NULL,
    Etiologia NVARCHAR(1000) NULL,
    Signos NVARCHAR(1000) NULL,
    Estado VARCHAR(30) NOT NULL DEFAULT 'active',
    CreadoPor INT NOT NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_NutritionDiagnoses_Consultation FOREIGN KEY (IdConsultation)
      REFERENCES Consultations(IdConsultation)
  );
  CREATE INDEX IX_NutritionDiagnoses_Consultation
    ON NutritionDiagnoses (IdOrganizacion, IdConsultation, FechaCreacion);
END;

IF OBJECT_ID('ClinicalGoals', 'U') IS NULL
BEGIN
  CREATE TABLE ClinicalGoals (
    IdClinicalGoal UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdConsultation UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    Titulo NVARCHAR(240) NOT NULL,
    Descripcion NVARCHAR(1000) NULL,
    ValorObjetivo DECIMAL(18,4) NULL,
    Unidad NVARCHAR(40) NULL,
    FechaObjetivo DATETIME2 NULL,
    Estado VARCHAR(30) NOT NULL DEFAULT 'active',
    CreadoPor INT NOT NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ClinicalGoals_Consultation FOREIGN KEY (IdConsultation)
      REFERENCES Consultations(IdConsultation)
  );
  CREATE INDEX IX_ClinicalGoals_Consultation
    ON ClinicalGoals (IdOrganizacion, IdConsultation, FechaCreacion);
END;

IF OBJECT_ID('FollowUps', 'U') IS NULL
BEGIN
  CREATE TABLE FollowUps (
    IdFollowUp UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdConsultation UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    Resumen NVARCHAR(1000) NOT NULL,
    Adherencia DECIMAL(5,2) NULL,
    Dificultades NVARCHAR(1000) NULL,
    ProximosPasos NVARCHAR(1000) NULL,
    FechaSeguimiento DATETIME2 NULL,
    CreadoPor INT NOT NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_FollowUps_Consultation FOREIGN KEY (IdConsultation)
      REFERENCES Consultations(IdConsultation)
  );
  CREATE INDEX IX_FollowUps_Consultation
    ON FollowUps (IdOrganizacion, IdConsultation, FechaCreacion);
END;

IF OBJECT_ID('LegacyHistoryImports', 'U') IS NULL
BEGIN
  CREATE TABLE LegacyHistoryImports (
    IdLegacyHistoryImport UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    LegacyHistoryId NVARCHAR(100) NOT NULL,
    Tipo NVARCHAR(120) NULL,
    Notas NVARCHAR(MAX) NULL,
    FechaOrigen DATETIME2 NULL,
    Origen NVARCHAR(120) NOT NULL DEFAULT 'patients-db',
    ImportadoEn DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_LegacyHistoryImports_Source UNIQUE (IdOrganizacion, Origen, LegacyHistoryId)
  );
END;

IF OBJECT_ID('SportEvaluators', 'U') IS NULL
BEGIN
  CREATE TABLE SportEvaluators (
    IdSportEvaluator UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdUsuario INT NOT NULL,
    DisplayName NVARCHAR(200) NOT NULL,
    IsakLevel TINYINT NOT NULL CHECK (IsakLevel IN (1,2)),
    AccreditationCode NVARCHAR(100) NOT NULL,
    Active BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UX_SportEvaluators_Accreditation UNIQUE (IdOrganizacion, AccreditationCode)
  );
END;

IF OBJECT_ID('SportAssessments', 'U') IS NULL
BEGIN
  CREATE TABLE SportAssessments (
    IdSportAssessment UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    IdSportEvaluator UNIQUEIDENTIFIER NOT NULL,
    ProtocolCode VARCHAR(30) NOT NULL CHECK (ProtocolCode IN ('ISAK_1','ISAK_2')),
    Sport NVARCHAR(120) NOT NULL,
    TrainingPhase NVARCHAR(120) NULL,
    AssessedAt DATETIME2 NOT NULL,
    Notes NVARCHAR(1000) NULL,
    CreatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_SportAssessments_Evaluator FOREIGN KEY (IdSportEvaluator)
      REFERENCES SportEvaluators(IdSportEvaluator)
  );
  CREATE INDEX IX_SportAssessments_PatientDate
    ON SportAssessments (IdOrganizacion, IdPaciente, AssessedAt DESC);
END;

IF OBJECT_ID('SportMeasurements', 'U') IS NULL
BEGIN
  CREATE TABLE SportMeasurements (
    IdSportMeasurement UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdSportAssessment UNIQUEIDENTIFIER NOT NULL,
    Category VARCHAR(30) NOT NULL CHECK (Category IN ('skinfold','diameter','length','circumference')),
    MeasurementCode VARCHAR(80) NOT NULL,
    Value DECIMAL(18,6) NOT NULL CHECK (Value > 0),
    Unit VARCHAR(10) NOT NULL CHECK (Unit IN ('mm','cm')),
    Side VARCHAR(20) NOT NULL CHECK (Side IN ('left','right','midline')),
    Equipment NVARCHAR(160) NOT NULL,
    CONSTRAINT FK_SportMeasurements_Assessment FOREIGN KEY (IdSportAssessment)
      REFERENCES SportAssessments(IdSportAssessment),
    CONSTRAINT UX_SportMeasurements_CodeSide UNIQUE
      (IdSportAssessment, Category, MeasurementCode, Side)
  );
END;

IF OBJECT_ID('SportCalculationResults', 'U') IS NULL
BEGIN
  CREATE TABLE SportCalculationResults (
    IdSportCalculationResult UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdSportAssessment UNIQUEIDENTIFIER NOT NULL,
    FormulaCode VARCHAR(80) NOT NULL,
    FormulaVersion VARCHAR(30) NOT NULL,
    Source NVARCHAR(500) NOT NULL,
    Inputs NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Inputs)=1),
    Result DECIMAL(18,6) NOT NULL,
    Unit VARCHAR(30) NOT NULL,
    Rounding TINYINT NOT NULL,
    ValidationStatus VARCHAR(30) NOT NULL,
    CONSTRAINT FK_SportCalculationResults_Assessment FOREIGN KEY (IdSportAssessment)
      REFERENCES SportAssessments(IdSportAssessment)
  );
END;

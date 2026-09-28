IF OBJECT_ID('AdvancedAnthropometricMeasurements', 'U') IS NULL
BEGIN
  CREATE TABLE AdvancedAnthropometricMeasurements (
    IdAdvancedMeasurement UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdMeasurementSession UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    Category VARCHAR(30) NOT NULL,
    MeasurementCode VARCHAR(80) NOT NULL,
    Value DECIMAL(18,6) NOT NULL CHECK (Value > 0),
    Unit VARCHAR(20) NOT NULL,
    Side VARCHAR(20) NULL,
    Method NVARCHAR(160) NULL,
    Equipment NVARCHAR(160) NULL,
    CreatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_AdvancedMeasurements_Session FOREIGN KEY (IdMeasurementSession)
      REFERENCES MeasurementSessions(IdMeasurementSession),
    CONSTRAINT CK_AdvancedMeasurements_Category CHECK
      (Category IN ('circumference','skinfold','diameter','length','segment')),
    CONSTRAINT CK_AdvancedMeasurements_Side CHECK
      (Side IS NULL OR Side IN ('left','right','midline')),
    CONSTRAINT UX_AdvancedMeasurements_SessionCode UNIQUE
      (IdMeasurementSession, Category, MeasurementCode, Side)
  );
  CREATE INDEX IX_AdvancedMeasurements_PatientDate
    ON AdvancedAnthropometricMeasurements
      (IdOrganizacion, IdPaciente, Category, MeasurementCode, CreatedAt);
END;

IF OBJECT_ID('BodyCompositionResults', 'U') IS NULL
BEGIN
  CREATE TABLE BodyCompositionResults (
    IdBodyCompositionResult UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdMeasurementSession UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    IndicatorCode VARCHAR(80) NOT NULL,
    CustomName NVARCHAR(160) NULL,
    Value DECIMAL(18,6) NOT NULL,
    Unit VARCHAR(20) NOT NULL,
    Method NVARCHAR(160) NOT NULL,
    Equipment NVARCHAR(160) NULL,
    FormulaCode VARCHAR(80) NULL,
    FormulaVersion VARCHAR(30) NULL,
    FormulaSource NVARCHAR(500) NULL,
    Inputs NVARCHAR(MAX) NULL CHECK (Inputs IS NULL OR ISJSON(Inputs)=1),
    Notes NVARCHAR(500) NULL,
    CreatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_BodyComposition_Session FOREIGN KEY (IdMeasurementSession)
      REFERENCES MeasurementSessions(IdMeasurementSession),
    CONSTRAINT CK_BodyComposition_Indicator CHECK (IndicatorCode IN (
      'body_fat_percent','fat_mass_kg','fat_free_mass_kg','muscle_mass_kg',
      'body_water_percent','bone_mass_kg','custom'
    )),
    CONSTRAINT UX_BodyComposition_SessionIndicator UNIQUE
      (IdMeasurementSession, IndicatorCode, CustomName)
  );
  CREATE INDEX IX_BodyComposition_PatientDate
    ON BodyCompositionResults (IdOrganizacion, IdPaciente, IndicatorCode, CreatedAt);
END;

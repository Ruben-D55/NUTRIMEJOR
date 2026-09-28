IF COL_LENGTH('MeasurementSessions', 'FechaMedicion') IS NULL
  ALTER TABLE MeasurementSessions ADD FechaMedicion DATETIME2 NOT NULL
    CONSTRAINT DF_MeasurementSessions_FechaMedicion DEFAULT SYSUTCDATETIME();
IF COL_LENGTH('MeasurementSessions', 'Metodo') IS NULL
  ALTER TABLE MeasurementSessions ADD Metodo NVARCHAR(160) NULL;
IF COL_LENGTH('MeasurementSessions', 'Equipo') IS NULL
  ALTER TABLE MeasurementSessions ADD Equipo NVARCHAR(160) NULL;
IF COL_LENGTH('MeasurementSessions', 'Protocolo') IS NULL
  ALTER TABLE MeasurementSessions ADD Protocolo NVARCHAR(160) NULL;
IF COL_LENGTH('MeasurementSessions', 'Observaciones') IS NULL
  ALTER TABLE MeasurementSessions ADD Observaciones NVARCHAR(1000) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MeasurementSessions_OrganizationPatientDate')
  CREATE INDEX IX_MeasurementSessions_OrganizationPatientDate
    ON MeasurementSessions (IdOrganizacion, IdPaciente, FechaMedicion DESC);

IF OBJECT_ID('AnthropometricMeasurements', 'U') IS NULL
BEGIN
  CREATE TABLE AnthropometricMeasurements (
    IdAnthropometricMeasurement UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdMeasurementSession UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    Tipo VARCHAR(60) NOT NULL,
    Valor DECIMAL(18,6) NOT NULL,
    Unidad VARCHAR(30) NOT NULL,
    Lado VARCHAR(20) NULL,
    Metodo NVARCHAR(160) NULL,
    Equipo NVARCHAR(160) NULL,
    CreadoPor INT NOT NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_AnthropometricMeasurements_Session FOREIGN KEY (IdMeasurementSession)
      REFERENCES MeasurementSessions(IdMeasurementSession),
    CONSTRAINT CK_AnthropometricMeasurements_Type CHECK (Tipo IN (
      'weight', 'height', 'waist', 'hip', 'arm_circumference'
    )),
    CONSTRAINT CK_AnthropometricMeasurements_Value CHECK (Valor > 0)
  );
  CREATE INDEX IX_AnthropometricMeasurements_PatientTypeDate
    ON AnthropometricMeasurements (IdOrganizacion, IdPaciente, Tipo, FechaCreacion);
END;

IF OBJECT_ID('VitalSigns', 'U') IS NULL
BEGIN
  CREATE TABLE VitalSigns (
    IdVitalSign UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdMeasurementSession UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    Tipo VARCHAR(60) NOT NULL,
    NombrePersonalizado NVARCHAR(120) NULL,
    Valor DECIMAL(18,6) NOT NULL,
    Unidad VARCHAR(30) NOT NULL,
    Metodo NVARCHAR(160) NULL,
    Equipo NVARCHAR(160) NULL,
    CreadoPor INT NOT NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_VitalSigns_Session FOREIGN KEY (IdMeasurementSession)
      REFERENCES MeasurementSessions(IdMeasurementSession),
    CONSTRAINT CK_VitalSigns_Type CHECK (Tipo IN (
      'blood_pressure_systolic', 'blood_pressure_diastolic', 'heart_rate',
      'temperature', 'oxygen_saturation', 'custom'
    ))
  );
  CREATE INDEX IX_VitalSigns_PatientTypeDate
    ON VitalSigns (IdOrganizacion, IdPaciente, Tipo, FechaCreacion);
END;

IF OBJECT_ID('LabPanels', 'U') IS NULL
BEGIN
  CREATE TABLE LabPanels (
    IdLabPanel UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdMeasurementSession UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    Nombre NVARCHAR(200) NOT NULL,
    Laboratorio NVARCHAR(200) NULL,
    FechaMuestra DATETIME2 NOT NULL,
    Observaciones NVARCHAR(1000) NULL,
    CreadoPor INT NOT NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_LabPanels_Session FOREIGN KEY (IdMeasurementSession)
      REFERENCES MeasurementSessions(IdMeasurementSession)
  );
  CREATE INDEX IX_LabPanels_PatientDate
    ON LabPanels (IdOrganizacion, IdPaciente, FechaMuestra DESC);
END;

IF OBJECT_ID('LabResults', 'U') IS NULL
BEGIN
  CREATE TABLE LabResults (
    IdLabResult UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdLabPanel UNIQUEIDENTIFIER NOT NULL,
    Parametro NVARCHAR(160) NOT NULL,
    Resultado DECIMAL(18,6) NOT NULL,
    Unidad NVARCHAR(40) NOT NULL,
    ReferenciaInferior DECIMAL(18,6) NULL,
    ReferenciaSuperior DECIMAL(18,6) NULL,
    Bandera VARCHAR(20) NULL,
    Observaciones NVARCHAR(500) NULL,
    CONSTRAINT FK_LabResults_Panel FOREIGN KEY (IdLabPanel)
      REFERENCES LabPanels(IdLabPanel)
  );
  CREATE INDEX IX_LabResults_PanelParameter ON LabResults (IdLabPanel, Parametro);
END;

IF OBJECT_ID('FormulaDefinitions', 'U') IS NULL
BEGIN
  CREATE TABLE FormulaDefinitions (
    IdFormulaDefinition UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Codigo VARCHAR(80) NOT NULL,
    Version VARCHAR(30) NOT NULL,
    Nombre NVARCHAR(200) NOT NULL,
    Expresion NVARCHAR(500) NOT NULL,
    UnidadResultado VARCHAR(30) NOT NULL,
    Fuente NVARCHAR(500) NOT NULL,
    Activa BIT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_FormulaDefinitions_CodeVersion UNIQUE (Codigo, Version)
  );
END;

IF NOT EXISTS (SELECT 1 FROM FormulaDefinitions WHERE Codigo='BMI' AND Version='1.0.0')
  INSERT INTO FormulaDefinitions (Codigo, Version, Nombre, Expresion, UnidadResultado, Fuente)
  VALUES ('BMI', '1.0.0', N'Índice de masa corporal', N'weightKg / (heightM * heightM)', 'kg/m2', N'Definición matemática estándar de IMC');
IF NOT EXISTS (SELECT 1 FROM FormulaDefinitions WHERE Codigo='WAIST_HIP_RATIO' AND Version='1.0.0')
  INSERT INTO FormulaDefinitions (Codigo, Version, Nombre, Expresion, UnidadResultado, Fuente)
  VALUES ('WAIST_HIP_RATIO', '1.0.0', N'Índice cintura/cadera', N'waistCm / hipCm', 'ratio', N'Razón matemática cintura-cadera');

IF OBJECT_ID('CalculationResults', 'U') IS NULL
BEGIN
  CREATE TABLE CalculationResults (
    IdCalculationResult UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdMeasurementSession UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    FormulaCode VARCHAR(80) NOT NULL,
    FormulaVersion VARCHAR(30) NOT NULL,
    Inputs NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Inputs) = 1),
    Resultado DECIMAL(18,6) NOT NULL,
    Unidad VARCHAR(30) NOT NULL,
    Redondeo INT NOT NULL,
    CreadoPor INT NOT NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_CalculationResults_Session FOREIGN KEY (IdMeasurementSession)
      REFERENCES MeasurementSessions(IdMeasurementSession),
    CONSTRAINT UQ_CalculationResults_SessionFormula UNIQUE
      (IdMeasurementSession, FormulaCode, FormulaVersion)
  );
  CREATE INDEX IX_CalculationResults_PatientFormulaDate
    ON CalculationResults (IdOrganizacion, IdPaciente, FormulaCode, FechaCreacion);
END;

IF OBJECT_ID('LegacyMeasurementImports', 'U') IS NULL
BEGIN
  CREATE TABLE LegacyMeasurementImports (
    IdLegacyMeasurementImport UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    LegacyKey NVARCHAR(160) NOT NULL,
    PesoKg DECIMAL(18,6) NULL,
    AlturaCm DECIMAL(18,6) NULL,
    FechaOrigen DATETIME2 NULL,
    Origen NVARCHAR(120) NOT NULL DEFAULT 'patients-db',
    IdMeasurementSession UNIQUEIDENTIFIER NOT NULL,
    ImportadoEn DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_LegacyMeasurementImports_Source UNIQUE
      (IdOrganizacion, Origen, LegacyKey)
  );
END;

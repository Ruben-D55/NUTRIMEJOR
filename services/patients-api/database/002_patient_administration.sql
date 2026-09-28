IF COL_LENGTH('Pacientes', 'TipoDocumento') IS NULL
  EXEC(N'ALTER TABLE Pacientes ADD TipoDocumento VARCHAR(20) NULL');
IF COL_LENGTH('Pacientes', 'NombrePreferido') IS NULL
  EXEC(N'ALTER TABLE Pacientes ADD NombrePreferido NVARCHAR(100) NULL');
IF COL_LENGTH('Pacientes', 'Direccion') IS NULL
  EXEC(N'ALTER TABLE Pacientes ADD Direccion NVARCHAR(250) NULL');
IF COL_LENGTH('Pacientes', 'Ciudad') IS NULL
  EXEC(N'ALTER TABLE Pacientes ADD Ciudad NVARCHAR(100) NULL');
IF COL_LENGTH('Pacientes', 'Pais') IS NULL
  EXEC(N'ALTER TABLE Pacientes ADD Pais CHAR(2) NULL');
IF COL_LENGTH('Pacientes', 'FotoRuta') IS NULL
  EXEC(N'ALTER TABLE Pacientes ADD FotoRuta NVARCHAR(500) NULL');
IF COL_LENGTH('Pacientes', 'CreadoPor') IS NULL
  EXEC(N'ALTER TABLE Pacientes ADD CreadoPor INT NULL');
IF COL_LENGTH('Pacientes', 'Version') IS NULL
  EXEC(N'ALTER TABLE Pacientes ADD Version INT NOT NULL CONSTRAINT DF_Pacientes_Version DEFAULT 1 WITH VALUES');
IF COL_LENGTH('Pacientes', 'EliminadoEn') IS NULL
  EXEC(N'ALTER TABLE Pacientes ADD EliminadoEn DATETIME2 NULL');

IF OBJECT_ID('ContactosPaciente', 'U') IS NULL
BEGIN
  CREATE TABLE ContactosPaciente (
    IdContacto UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdPaciente UNIQUEIDENTIFIER NOT NULL REFERENCES Pacientes(IdPaciente),
    Tipo VARCHAR(20) NOT NULL CHECK (Tipo IN ('phone', 'email', 'whatsapp', 'other')),
    Valor NVARCHAR(180) NOT NULL,
    Etiqueta NVARCHAR(60) NULL,
    Principal BIT NOT NULL DEFAULT 0,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_ContactosPaciente_Paciente ON ContactosPaciente (IdPaciente, Principal DESC);
END;

IF OBJECT_ID('ContactosEmergencia', 'U') IS NULL
BEGIN
  CREATE TABLE ContactosEmergencia (
    IdContactoEmergencia UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdPaciente UNIQUEIDENTIFIER NOT NULL REFERENCES Pacientes(IdPaciente),
    Nombre NVARCHAR(150) NOT NULL,
    Relacion NVARCHAR(80) NULL,
    Telefono NVARCHAR(30) NOT NULL,
    Email NVARCHAR(180) NULL,
    Principal BIT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_ContactosEmergencia_Paciente ON ContactosEmergencia (IdPaciente, Principal DESC);
END;

IF OBJECT_ID('AsignacionesPaciente', 'U') IS NULL
BEGIN
  CREATE TABLE AsignacionesPaciente (
    IdPaciente UNIQUEIDENTIFIER NOT NULL REFERENCES Pacientes(IdPaciente),
    IdUsuario INT NOT NULL,
    Rol VARCHAR(30) NOT NULL DEFAULT 'NUTRITIONIST',
    AsignadoPor INT NOT NULL,
    Activa BIT NOT NULL DEFAULT 1,
    FechaAsignacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaFin DATETIME2 NULL,
    PRIMARY KEY (IdPaciente, IdUsuario)
  );
  CREATE INDEX IX_AsignacionesPaciente_Usuario ON AsignacionesPaciente (IdUsuario, Activa);
END;

IF OBJECT_ID('Etiquetas', 'U') IS NULL
BEGIN
  CREATE TABLE Etiquetas (
    IdEtiqueta UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    Nombre NVARCHAR(60) NOT NULL,
    Color CHAR(7) NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Etiquetas_Organizacion_Nombre UNIQUE (IdOrganizacion, Nombre)
  );
END;

IF OBJECT_ID('EtiquetasPaciente', 'U') IS NULL
BEGIN
  CREATE TABLE EtiquetasPaciente (
    IdPaciente UNIQUEIDENTIFIER NOT NULL REFERENCES Pacientes(IdPaciente),
    IdEtiqueta UNIQUEIDENTIFIER NOT NULL REFERENCES Etiquetas(IdEtiqueta),
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    PRIMARY KEY (IdPaciente, IdEtiqueta)
  );
END;

IF OBJECT_ID('ConsentimientosPaciente', 'U') IS NULL
BEGIN
  CREATE TABLE ConsentimientosPaciente (
    IdConsentimiento UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdPaciente UNIQUEIDENTIFIER NOT NULL REFERENCES Pacientes(IdPaciente),
    Tipo VARCHAR(40) NOT NULL,
    Estado VARCHAR(20) NOT NULL CHECK (Estado IN ('granted', 'revoked')),
    VersionDocumento NVARCHAR(40) NOT NULL,
    Evidencia NVARCHAR(500) NULL,
    RegistradoPor INT NOT NULL,
    OtorgadoEn DATETIME2 NULL,
    RevocadoEn DATETIME2 NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_ConsentimientosPaciente_Paciente ON ConsentimientosPaciente (IdPaciente, Tipo, FechaCreacion DESC);
END;

IF OBJECT_ID('HistorialAdministrativoPaciente', 'U') IS NULL
BEGIN
  CREATE TABLE HistorialAdministrativoPaciente (
    IdEvento UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdPaciente UNIQUEIDENTIFIER NOT NULL REFERENCES Pacientes(IdPaciente),
    TipoEvento VARCHAR(60) NOT NULL,
    ActorId INT NOT NULL,
    Datos NVARCHAR(MAX) NOT NULL DEFAULT '{}' CHECK (ISJSON(Datos) = 1),
    OcurridoEn DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_HistorialAdministrativoPaciente_Paciente
    ON HistorialAdministrativoPaciente (IdPaciente, OcurridoEn DESC);
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

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Pacientes_OrganizacionEstado')
  EXEC(N'CREATE INDEX IX_Pacientes_OrganizacionEstado
    ON Pacientes (IdOrganizacion, Estado, EliminadoEn, FechaActualizacion DESC)');

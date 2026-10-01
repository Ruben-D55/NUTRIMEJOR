IF OBJECT_ID('Pacientes', 'U') IS NULL
BEGIN
  CREATE TABLE Pacientes (
    IdPaciente UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NULL,
    IdNutricionista INT NOT NULL,
    Nombres NVARCHAR(100) NOT NULL,
    Apellidos NVARCHAR(100) NOT NULL,
    Documento NVARCHAR(30) NULL,
    FechaNacimiento DATE NULL,
    Sexo NVARCHAR(20) NULL,
    Telefono NVARCHAR(30) NULL,
    Email NVARCHAR(180) NULL,
    Objetivo NVARCHAR(300) NULL,
    Peso DECIMAL(6,2) NULL,
    Altura DECIMAL(6,2) NULL,
    Estado VARCHAR(20) NOT NULL DEFAULT 'Activo'
      CHECK (Estado IN ('Activo', 'Inactivo')),
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Pacientes_Propietario
    ON Pacientes (IdNutricionista, Estado, FechaActualizacion DESC);
END;

IF COL_LENGTH('Pacientes', 'IdOrganizacion') IS NULL
BEGIN
  ALTER TABLE Pacientes ADD IdOrganizacion UNIQUEIDENTIFIER NULL;
END;

IF OBJECT_ID('HistorialPaciente', 'U') IS NULL
BEGIN
  CREATE TABLE HistorialPaciente (
    IdHistorial UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdPaciente UNIQUEIDENTIFIER NOT NULL
      REFERENCES Pacientes(IdPaciente) ON DELETE CASCADE,
    Tipo NVARCHAR(60) NOT NULL,
    Notas NVARCHAR(MAX) NOT NULL,
    Fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Historial_Paciente_Fecha
    ON HistorialPaciente (IdPaciente, Fecha DESC);
END;

IF OBJECT_ID('Usuarios', 'U') IS NULL
BEGIN
  CREATE TABLE Usuarios (
    IdUsuario INT IDENTITY PRIMARY KEY,
    Nombre NVARCHAR(120) NOT NULL,
    Email NVARCHAR(180) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    Rol VARCHAR(20) NOT NULL DEFAULT 'NUTRICIONISTA'
      CHECK (Rol IN ('ADMIN', 'NUTRICIONISTA')),
    Matricula NVARCHAR(80) NULL,
    Especialidad NVARCHAR(120) NULL,
    Apariencia VARCHAR(10) NOT NULL DEFAULT 'system'
      CHECK (Apariencia IN ('light', 'dark', 'system')),
    Activo BIT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('Organizaciones', 'U') IS NULL
BEGIN
  CREATE TABLE Organizaciones (
    IdOrganizacion UNIQUEIDENTIFIER PRIMARY KEY,
    Nombre NVARCHAR(150) NOT NULL,
    Slug VARCHAR(80) NOT NULL UNIQUE,
    Activa BIT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF COL_LENGTH('Usuarios', 'IdOrganizacion') IS NULL
BEGIN
  EXEC(N'ALTER TABLE Usuarios ADD IdOrganizacion UNIQUEIDENTIFIER NULL');
  EXEC(N'UPDATE Usuarios SET IdOrganizacion = NEWID() WHERE IdOrganizacion IS NULL');
  EXEC(N'ALTER TABLE Usuarios ALTER COLUMN IdOrganizacion UNIQUEIDENTIFIER NOT NULL');
END;

EXEC(N'
  INSERT INTO Organizaciones (IdOrganizacion, Nombre, Slug)
  SELECT userRow.IdOrganizacion, CONCAT(N''Organización de '', userRow.Nombre),
    CONCAT(''org-'', LOWER(CONVERT(VARCHAR(36), userRow.IdOrganizacion)))
  FROM Usuarios userRow
  WHERE NOT EXISTS (
    SELECT 1 FROM Organizaciones organization
    WHERE organization.IdOrganizacion = userRow.IdOrganizacion
  )
');

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_Usuarios_Organizaciones'
)
BEGIN
  EXEC(N'
    ALTER TABLE Usuarios
    ADD CONSTRAINT FK_Usuarios_Organizaciones
    FOREIGN KEY (IdOrganizacion) REFERENCES Organizaciones(IdOrganizacion)
  ');
END;

IF OBJECT_ID('MiembrosOrganizacion', 'U') IS NULL
BEGIN
  CREATE TABLE MiembrosOrganizacion (
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL
      REFERENCES Organizaciones(IdOrganizacion),
    IdUsuario INT NOT NULL REFERENCES Usuarios(IdUsuario),
    Rol VARCHAR(20) NOT NULL
      CHECK (Rol IN ('OWNER', 'ADMIN', 'NUTRITIONIST', 'ASSISTANT')),
    Activo BIT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    PRIMARY KEY (IdOrganizacion, IdUsuario)
  );
  CREATE INDEX IX_MiembrosOrganizacion_Usuario
    ON MiembrosOrganizacion (IdUsuario, Activo);
END;

EXEC(N'
  INSERT INTO MiembrosOrganizacion (IdOrganizacion, IdUsuario, Rol)
  SELECT userRow.IdOrganizacion, userRow.IdUsuario,
    CASE WHEN userRow.Rol = ''ADMIN'' THEN ''ADMIN'' ELSE ''OWNER'' END
  FROM Usuarios userRow
  WHERE NOT EXISTS (
    SELECT 1 FROM MiembrosOrganizacion member
    WHERE member.IdOrganizacion = userRow.IdOrganizacion
      AND member.IdUsuario = userRow.IdUsuario
  )
');

IF OBJECT_ID('InvitacionesOrganizacion', 'U') IS NULL
BEGIN
  CREATE TABLE InvitacionesOrganizacion (
    IdInvitacion UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL REFERENCES Organizaciones(IdOrganizacion),
    Email NVARCHAR(180) NOT NULL,
    Rol VARCHAR(20) NOT NULL
      CHECK (Rol IN ('ADMIN', 'NUTRITIONIST', 'ASSISTANT')),
    TokenHash CHAR(64) NOT NULL UNIQUE,
    InvitadoPor INT NOT NULL REFERENCES Usuarios(IdUsuario),
    ExpiraEn DATETIME2 NOT NULL,
    AceptadaEn DATETIME2 NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_InvitacionesOrganizacion_Pendientes
    ON InvitacionesOrganizacion (IdOrganizacion, Email, AceptadaEn, ExpiraEn);
END;

IF OBJECT_ID('SesionesRenovacion', 'U') IS NULL
BEGIN
  CREATE TABLE SesionesRenovacion (
    IdSesion UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdUsuario INT NOT NULL REFERENCES Usuarios(IdUsuario),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL REFERENCES Organizaciones(IdOrganizacion),
    TokenHash CHAR(64) NOT NULL UNIQUE,
    ExpiraEn DATETIME2 NOT NULL,
    RevocadaEn DATETIME2 NULL,
    ReemplazadaPor UNIQUEIDENTIFIER NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UltimoUsoEn DATETIME2 NULL
  );
  CREATE INDEX IX_SesionesRenovacion_Activas
    ON SesionesRenovacion (IdUsuario, IdOrganizacion, RevocadaEn, ExpiraEn);
END;

IF OBJECT_ID('TokensRecuperacionPassword', 'U') IS NULL
BEGIN
  CREATE TABLE TokensRecuperacionPassword (
    IdToken UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdUsuario INT NOT NULL REFERENCES Usuarios(IdUsuario),
    TokenHash CHAR(64) NOT NULL UNIQUE,
    ExpiraEn DATETIME2 NOT NULL,
    UsadoEn DATETIME2 NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_TokensRecuperacionPassword_Activos
    ON TokensRecuperacionPassword (IdUsuario, UsadoEn, ExpiraEn);
END;

IF OBJECT_ID('EventosAuditoriaAcceso', 'U') IS NULL
BEGIN
  CREATE TABLE EventosAuditoriaAcceso (
    IdEvento UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdUsuario INT NULL,
    IdOrganizacion UNIQUEIDENTIFIER NULL,
    TipoEvento VARCHAR(60) NOT NULL,
    Exitoso BIT NOT NULL,
    RequestId NVARCHAR(100) NULL,
    IpHash CHAR(64) NULL,
    UserAgent NVARCHAR(300) NULL,
    Detalles NVARCHAR(MAX) NOT NULL DEFAULT '{}'
      CHECK (ISJSON(Detalles) = 1),
    OcurridoEn DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_EventosAuditoriaAcceso_Organizacion
    ON EventosAuditoriaAcceso (IdOrganizacion, OcurridoEn DESC);
  CREATE INDEX IX_EventosAuditoriaAcceso_Usuario
    ON EventosAuditoriaAcceso (IdUsuario, OcurridoEn DESC);
END;

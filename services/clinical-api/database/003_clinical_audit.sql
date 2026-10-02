IF OBJECT_ID('ClinicalAuditEvents', 'U') IS NULL
BEGIN
  CREATE TABLE ClinicalAuditEvents (
    IdAuditEvent UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdUsuario INT NOT NULL,
    Rol VARCHAR(20) NULL,
    Accion VARCHAR(80) NOT NULL,
    TipoEntidad VARCHAR(80) NOT NULL,
    IdEntidad NVARCHAR(100) NULL,
    IdPaciente UNIQUEIDENTIFIER NULL,
    Exitoso BIT NOT NULL,
    Detalles NVARCHAR(MAX) NOT NULL DEFAULT '{}' CHECK (ISJSON(Detalles)=1),
    OcurridoEn DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_ClinicalAuditEvents_OrganizationTime
    ON ClinicalAuditEvents(IdOrganizacion, OcurridoEn DESC);
  CREATE INDEX IX_ClinicalAuditEvents_PatientTime
    ON ClinicalAuditEvents(IdOrganizacion, IdPaciente, OcurridoEn DESC);
END;


DECLARE @memberConstraint sysname;
SELECT @memberConstraint = cc.name
FROM sys.check_constraints cc
WHERE cc.parent_object_id = OBJECT_ID('MiembrosOrganizacion')
  AND COL_NAME(cc.parent_object_id, cc.parent_column_id) = 'Rol';
IF @memberConstraint IS NOT NULL EXEC('ALTER TABLE MiembrosOrganizacion DROP CONSTRAINT [' + @memberConstraint + ']');
ALTER TABLE MiembrosOrganizacion ADD CONSTRAINT CK_MiembrosOrganizacion_Rol
  CHECK (Rol IN ('OWNER', 'ADMIN', 'NUTRITIONIST', 'ASSISTANT', 'PATIENT'));

IF COL_LENGTH('MiembrosOrganizacion', 'IdPaciente') IS NULL
  ALTER TABLE MiembrosOrganizacion ADD IdPaciente UNIQUEIDENTIFIER NULL;

DECLARE @invitationConstraint sysname;
SELECT @invitationConstraint = cc.name
FROM sys.check_constraints cc
WHERE cc.parent_object_id = OBJECT_ID('InvitacionesOrganizacion')
  AND COL_NAME(cc.parent_object_id, cc.parent_column_id) = 'Rol';
IF @invitationConstraint IS NOT NULL EXEC('ALTER TABLE InvitacionesOrganizacion DROP CONSTRAINT [' + @invitationConstraint + ']');
ALTER TABLE InvitacionesOrganizacion ADD CONSTRAINT CK_InvitacionesOrganizacion_Rol
  CHECK (Rol IN ('ADMIN', 'NUTRITIONIST', 'ASSISTANT', 'PATIENT'));

IF COL_LENGTH('InvitacionesOrganizacion', 'IdPaciente') IS NULL
  ALTER TABLE InvitacionesOrganizacion ADD IdPaciente UNIQUEIDENTIFIER NULL;

IF COL_LENGTH('SesionesRenovacion', 'FamiliaId') IS NULL
BEGIN
  ALTER TABLE SesionesRenovacion ADD FamiliaId UNIQUEIDENTIFIER NULL;
  EXEC('UPDATE SesionesRenovacion SET FamiliaId=IdSesion WHERE FamiliaId IS NULL');
  ALTER TABLE SesionesRenovacion ALTER COLUMN FamiliaId UNIQUEIDENTIFIER NOT NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SesionesRenovacion_Familia')
  CREATE INDEX IX_SesionesRenovacion_Familia ON SesionesRenovacion(FamiliaId, RevocadaEn);


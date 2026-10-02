IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Members_OrganizationActive' AND object_id=OBJECT_ID('MiembrosOrganizacion'))
  DROP INDEX IX_Members_OrganizationActive ON MiembrosOrganizacion;

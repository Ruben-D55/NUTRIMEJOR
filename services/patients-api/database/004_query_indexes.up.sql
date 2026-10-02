IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Patients_ActiveList' AND object_id=OBJECT_ID('Pacientes'))
  CREATE INDEX IX_Patients_ActiveList ON Pacientes (IdOrganizacion, FechaActualizacion DESC, IdPaciente DESC) INCLUDE (Estado, Nombres, Apellidos, Email) WHERE EliminadoEn IS NULL;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Patients_ActiveList' AND object_id=OBJECT_ID('Pacientes'))
  DROP INDEX IX_Patients_ActiveList ON Pacientes;

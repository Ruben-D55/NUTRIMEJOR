IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ClinicalEntries_PatientTimeline' AND object_id=OBJECT_ID('ClinicalEntries'))
  CREATE INDEX IX_ClinicalEntries_PatientTimeline ON ClinicalEntries (IdOrganizacion, IdPaciente, FechaActualizacion DESC) INCLUDE (Categoria, Titulo, IdConsultation, Estado);

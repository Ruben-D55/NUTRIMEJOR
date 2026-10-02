IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DocumentRequests_PatientTimeline' AND object_id=OBJECT_ID('DocumentRequests'))
  CREATE INDEX IX_DocumentRequests_PatientTimeline ON DocumentRequests (IdOrganizacion, IdPaciente, RequestedAt DESC) INCLUDE (Estado, DocumentType, Titulo, StoragePath);

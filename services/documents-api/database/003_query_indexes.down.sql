IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DocumentRequests_PatientTimeline' AND object_id=OBJECT_ID('DocumentRequests'))
  DROP INDEX IX_DocumentRequests_PatientTimeline ON DocumentRequests;

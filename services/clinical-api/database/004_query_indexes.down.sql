IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ClinicalEntries_PatientTimeline' AND object_id=OBJECT_ID('ClinicalEntries'))
  DROP INDEX IX_ClinicalEntries_PatientTimeline ON ClinicalEntries;

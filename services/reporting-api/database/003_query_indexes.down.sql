IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_InboxMessages_PatientTimeline' AND object_id=OBJECT_ID('InboxMessages'))
  DROP INDEX IX_InboxMessages_PatientTimeline ON InboxMessages;

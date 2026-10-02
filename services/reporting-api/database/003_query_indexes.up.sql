IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_InboxMessages_PatientTimeline' AND object_id=OBJECT_ID('InboxMessages'))
  CREATE INDEX IX_InboxMessages_PatientTimeline ON InboxMessages (IdOrganizacion, IdPaciente, OccurredAt DESC, EventId DESC) INCLUDE (DomainName, EventType, AggregateId) WHERE IdPaciente IS NOT NULL;

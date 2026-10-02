IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_NotificationJobs_Queued' AND object_id=OBJECT_ID('NotificationJobs'))
  CREATE INDEX IX_NotificationJobs_Queued ON NotificationJobs (NextAttemptAt, FechaCreacion) INCLUDE (Channel, Recipient, AttemptCount, IdOrganizacion, IdPaciente) WHERE Estado='queued';

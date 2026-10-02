IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_NotificationJobs_Queued' AND object_id=OBJECT_ID('NotificationJobs'))
  DROP INDEX IX_NotificationJobs_Queued ON NotificationJobs;

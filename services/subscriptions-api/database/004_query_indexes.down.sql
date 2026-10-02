IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Subscriptions_StatusPeriod' AND object_id=OBJECT_ID('Subscriptions'))
  DROP INDEX IX_Subscriptions_StatusPeriod ON Subscriptions;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Plans_ActiveOrder' AND object_id=OBJECT_ID('Plans'))
  DROP INDEX IX_Plans_ActiveOrder ON Plans;

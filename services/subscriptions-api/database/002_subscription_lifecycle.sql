IF OBJECT_ID('SubscriptionStatusHistory', 'U') IS NULL
BEGIN
  CREATE TABLE SubscriptionStatusHistory (
    IdSubscriptionStatusHistory UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdSubscription UNIQUEIDENTIFIER NOT NULL,
    PreviousStatus VARCHAR(20) NULL,
    NewStatus VARCHAR(20) NOT NULL,
    PreviousPlanCode VARCHAR(20) NULL,
    NewPlanCode VARCHAR(20) NOT NULL,
    Reason NVARCHAR(500) NULL,
    ChangedBy INT NOT NULL,
    ChangedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_SubscriptionStatusHistory_Subscription
      FOREIGN KEY (IdSubscription) REFERENCES Subscriptions(IdSubscription)
  );
  CREATE INDEX IX_SubscriptionStatusHistory_Subscription
    ON SubscriptionStatusHistory (IdSubscription, ChangedAt);
END;

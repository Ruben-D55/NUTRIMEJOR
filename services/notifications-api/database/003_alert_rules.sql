IF OBJECT_ID('AlertRules', 'U') IS NULL
BEGIN
  CREATE TABLE AlertRules (
    IdAlertRule UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    RuleType VARCHAR(50) NOT NULL,
    Conditions NVARCHAR(MAX) NOT NULL DEFAULT '{}' CHECK (ISJSON(Conditions)=1),
    Channels NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Channels)=1),
    LeadMinutes INT NOT NULL DEFAULT 0 CHECK (LeadMinutes BETWEEN 0 AND 525600),
    Enabled BIT NOT NULL DEFAULT 1,
    CreatedBy INT NOT NULL,
    UpdatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_AlertRules_Type CHECK (RuleType IN (
      'patient_without_follow_up','upcoming_appointment','expiring_meal_plan',
      'missed_appointment','incomplete_patient_data','pending_lab',
      'pending_anthropometry','pending_review'
    ))
  );
  CREATE INDEX IX_AlertRules_OrganizationEnabled
    ON AlertRules (IdOrganizacion, Enabled, RuleType);
END;

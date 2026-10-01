IF OBJECT_ID('PlanGenerationRuns', 'U') IS NULL
BEGIN
  CREATE TABLE PlanGenerationRuns (
    IdGenerationRun UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    IdMealPlan UNIQUEIDENTIFIER NULL,
    RequestedBy INT NOT NULL,
    AlgorithmVersion VARCHAR(40) NOT NULL,
    InputSnapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(InputSnapshot)=1),
    ResultSnapshot NVARCHAR(MAX) NULL CHECK (ResultSnapshot IS NULL OR ISJSON(ResultSnapshot)=1),
    Status VARCHAR(30) NOT NULL,
    FailureReason NVARCHAR(1000) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CompletedAt DATETIME2 NULL
  );
END;

IF OBJECT_ID('MealPlanReviews', 'U') IS NULL
BEGIN
  CREATE TABLE MealPlanReviews (
    IdMealPlanReview UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdMealPlan UNIQUEIDENTIFIER NOT NULL,
    Decision VARCHAR(20) NOT NULL CHECK (Decision IN ('approved','changes_requested')),
    Comments NVARCHAR(2000) NULL,
    ReviewedBy INT NOT NULL,
    ReviewedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_MealPlanReviews_Plan FOREIGN KEY (IdMealPlan) REFERENCES MealPlans(IdMealPlan)
  );
END;

IF OBJECT_ID('ShoppingLists', 'U') IS NULL
BEGIN
  CREATE TABLE ShoppingLists (
    IdShoppingList UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdMealPlan UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Snapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Snapshot)=1),
    CreatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ShoppingLists_Plan FOREIGN KEY (IdMealPlan) REFERENCES MealPlans(IdMealPlan)
  );
END;

IF OBJECT_ID('SubstitutionEvaluations', 'U') IS NULL
BEGIN
  CREATE TABLE SubstitutionEvaluations (
    IdSubstitutionEvaluation UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    RequestedBy INT NOT NULL,
    InputSnapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(InputSnapshot)=1),
    ResultSnapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(ResultSnapshot)=1),
    AlgorithmVersion VARCHAR(40) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

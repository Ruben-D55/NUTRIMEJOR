IF COL_LENGTH('NutritionAssessments', 'TipoEvaluacion') IS NULL
  ALTER TABLE NutritionAssessments ADD TipoEvaluacion VARCHAR(40) NOT NULL
    CONSTRAINT DF_NutritionAssessments_TipoEvaluacion DEFAULT 'comprehensive';
IF COL_LENGTH('NutritionAssessments', 'FechaEvaluacion') IS NULL
  ALTER TABLE NutritionAssessments ADD FechaEvaluacion DATETIME2 NOT NULL
    CONSTRAINT DF_NutritionAssessments_FechaEvaluacion DEFAULT SYSUTCDATETIME();
IF COL_LENGTH('NutritionAssessments', 'CompletadaEn') IS NULL
  ALTER TABLE NutritionAssessments ADD CompletadaEn DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_NutritionAssessments_OrganizationPatientDate')
  CREATE INDEX IX_NutritionAssessments_OrganizationPatientDate
    ON NutritionAssessments (IdOrganizacion, IdPaciente, FechaEvaluacion DESC);

IF OBJECT_ID('LifestyleAssessments', 'U') IS NULL
BEGIN
  CREATE TABLE LifestyleAssessments (
    IdLifestyleAssessment UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdNutritionAssessment UNIQUEIDENTIFIER NOT NULL UNIQUE,
    DailyActivity NVARCHAR(500) NULL,
    WorkSchedule NVARCHAR(500) NULL,
    SleepHours DECIMAL(5,2) NULL,
    PhysicalActivity NVARCHAR(500) NULL,
    ExerciseType NVARCHAR(200) NULL,
    ExerciseFrequencyPerWeek DECIMAL(5,2) NULL,
    ExerciseDurationMinutes INT NULL,
    ExerciseIntensity VARCHAR(30) NULL,
    Alcohol NVARCHAR(300) NULL,
    Tobacco NVARCHAR(300) NULL,
    Coffee NVARCHAR(300) NULL,
    OtherVariables NVARCHAR(MAX) NOT NULL DEFAULT '{}' CHECK (ISJSON(OtherVariables) = 1),
    CONSTRAINT FK_LifestyleAssessments_Assessment FOREIGN KEY (IdNutritionAssessment)
      REFERENCES NutritionAssessments(IdNutritionAssessment)
  );
END;

IF OBJECT_ID('DietaryAssessments', 'U') IS NULL
BEGIN
  CREATE TABLE DietaryAssessments (
    IdDietaryAssessment UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdNutritionAssessment UNIQUEIDENTIFIER NOT NULL UNIQUE,
    MealsPerDay INT NULL,
    Schedules NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(Schedules) = 1),
    PreparedBy NVARCHAR(200) NULL,
    Appetite NVARCHAR(300) NULL,
    Hunger NVARCHAR(300) NULL,
    Satiety NVARCHAR(300) NULL,
    Preferences NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(Preferences) = 1),
    DislikedFoods NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(DislikedFoods) = 1),
    DiscomfortFoods NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(DiscomfortFoods) = 1),
    Allergies NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(Allergies) = 1),
    Intolerances NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(Intolerances) = 1),
    Supplements NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(Supplements) = 1),
    EmotionalEating NVARCHAR(500) NULL,
    StressEating NVARCHAR(500) NULL,
    AddedSalt NVARCHAR(200) NULL,
    FatType NVARCHAR(200) NULL,
    PreviousDiets NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(PreviousDiets) = 1),
    WeightLossMedications NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(WeightLossMedications) = 1),
    WaterLiters DECIMAL(8,3) NULL,
    Beverages NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(Beverages) = 1),
    WeekendChanges NVARCHAR(1000) NULL,
    CONSTRAINT FK_DietaryAssessments_Assessment FOREIGN KEY (IdNutritionAssessment)
      REFERENCES NutritionAssessments(IdNutritionAssessment)
  );
END;

IF OBJECT_ID('Recall24h', 'U') IS NULL
BEGIN
  CREATE TABLE Recall24h (
    IdRecall24h UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdNutritionAssessment UNIQUEIDENTIFIER NOT NULL UNIQUE,
    RecallDate DATE NOT NULL,
    Notes NVARCHAR(1000) NULL,
    CONSTRAINT FK_Recall24h_Assessment FOREIGN KEY (IdNutritionAssessment)
      REFERENCES NutritionAssessments(IdNutritionAssessment)
  );
END;

IF OBJECT_ID('RecallMeals', 'U') IS NULL
BEGIN
  CREATE TABLE RecallMeals (
    IdRecallMeal UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdRecall24h UNIQUEIDENTIFIER NOT NULL,
    TimeOfDay TIME NULL,
    MealType NVARCHAR(80) NOT NULL,
    Position INT NOT NULL,
    Notes NVARCHAR(500) NULL,
    CONSTRAINT FK_RecallMeals_Recall FOREIGN KEY (IdRecall24h) REFERENCES Recall24h(IdRecall24h)
  );
END;

IF OBJECT_ID('RecallItems', 'U') IS NULL
BEGIN
  CREATE TABLE RecallItems (
    IdRecallItem UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdRecallMeal UNIQUEIDENTIFIER NOT NULL,
    FoodId UNIQUEIDENTIFIER NOT NULL,
    FoodVersion INT NOT NULL,
    FoodSnapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(FoodSnapshot) = 1),
    AmountGrams DECIMAL(18,6) NOT NULL,
    Unit NVARCHAR(40) NOT NULL DEFAULT 'g',
    HouseholdMeasure NVARCHAR(120) NULL,
    Preparation NVARCHAR(300) NULL,
    Notes NVARCHAR(500) NULL,
    Position INT NOT NULL,
    CONSTRAINT FK_RecallItems_Meal FOREIGN KEY (IdRecallMeal) REFERENCES RecallMeals(IdRecallMeal),
    CONSTRAINT CK_RecallItems_Amount CHECK (AmountGrams > 0)
  );
END;

IF OBJECT_ID('FoodFrequencyAssessments', 'U') IS NULL
BEGIN
  CREATE TABLE FoodFrequencyAssessments (
    IdFoodFrequencyAssessment UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdNutritionAssessment UNIQUEIDENTIFIER NOT NULL UNIQUE,
    PeriodStart DATE NULL,
    PeriodEnd DATE NULL,
    Notes NVARCHAR(1000) NULL,
    CONSTRAINT FK_FoodFrequencyAssessments_Assessment FOREIGN KEY (IdNutritionAssessment)
      REFERENCES NutritionAssessments(IdNutritionAssessment)
  );
END;

IF OBJECT_ID('FoodFrequencyEntries', 'U') IS NULL
BEGIN
  CREATE TABLE FoodFrequencyEntries (
    IdFoodFrequencyEntry UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdFoodFrequencyAssessment UNIQUEIDENTIFIER NOT NULL,
    FoodGroup NVARCHAR(120) NOT NULL,
    FrequencyValue DECIMAL(10,3) NOT NULL,
    FrequencyUnit VARCHAR(30) NOT NULL,
    PortionDescription NVARCHAR(200) NULL,
    Notes NVARCHAR(500) NULL,
    CONSTRAINT FK_FoodFrequencyEntries_Assessment FOREIGN KEY (IdFoodFrequencyAssessment)
      REFERENCES FoodFrequencyAssessments(IdFoodFrequencyAssessment),
    CONSTRAINT CK_FoodFrequencyEntries_Unit CHECK (FrequencyUnit IN ('day', 'week', 'month', 'never'))
  );
END;

IF OBJECT_ID('NutrientAnalysisSnapshots', 'U') IS NULL
BEGIN
  CREATE TABLE NutrientAnalysisSnapshots (
    IdNutrientAnalysisSnapshot UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdNutritionAssessment UNIQUEIDENTIFIER NOT NULL,
    AnalysisType VARCHAR(40) NOT NULL,
    CalculationVersion VARCHAR(30) NOT NULL,
    Totals NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Totals) = 1),
    SourcesSnapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(SourcesSnapshot) = 1),
    CalculatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_NutrientAnalysisSnapshots_Assessment FOREIGN KEY (IdNutritionAssessment)
      REFERENCES NutritionAssessments(IdNutritionAssessment)
  );
  CREATE INDEX IX_NutrientAnalysisSnapshots_Assessment
    ON NutrientAnalysisSnapshots (IdNutritionAssessment, AnalysisType, CalculatedAt DESC);
END;

IF COL_LENGTH('MealPlans', 'FechaInicio') IS NULL
  ALTER TABLE MealPlans ADD FechaInicio DATE NULL;
IF COL_LENGTH('MealPlans', 'FechaFin') IS NULL
  ALTER TABLE MealPlans ADD FechaFin DATE NULL;
IF COL_LENGTH('MealPlans', 'PublicadoEn') IS NULL
  ALTER TABLE MealPlans ADD PublicadoEn DATETIME2 NULL;

IF OBJECT_ID('PlanningFormulaDefinitions', 'U') IS NULL
BEGIN
  CREATE TABLE PlanningFormulaDefinitions (
    IdFormulaDefinition UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Code VARCHAR(80) NOT NULL,
    Version VARCHAR(30) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    Expression NVARCHAR(1000) NOT NULL,
    ResultUnit VARCHAR(30) NOT NULL,
    Source NVARCHAR(500) NOT NULL,
    Rounding INT NOT NULL,
    Active BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_PlanningFormulaDefinitions_CodeVersion UNIQUE (Code, Version)
  );
END;

IF NOT EXISTS (SELECT 1 FROM PlanningFormulaDefinitions WHERE Code='MIFFLIN_ST_JEOR' AND Version='1.0.0')
  INSERT INTO PlanningFormulaDefinitions
    (Code, Version, Name, Expression, ResultUnit, Source, Rounding)
  VALUES
    ('MIFFLIN_ST_JEOR', '1.0.0', N'Mifflin-St Jeor',
     N'10*weightKg + 6.25*heightCm - 5*ageYears + sexConstant',
     'kcal/day', N'Mifflin MD et al. Am J Clin Nutr. 1990;51:241-247.', 0);
IF NOT EXISTS (SELECT 1 FROM PlanningFormulaDefinitions WHERE Code='TOTAL_ENERGY_EXPENDITURE' AND Version='1.0.0')
  INSERT INTO PlanningFormulaDefinitions
    (Code, Version, Name, Expression, ResultUnit, Source, Rounding)
  VALUES
    ('TOTAL_ENERGY_EXPENDITURE', '1.0.0', N'Gasto energético total',
     N'basalEnergy * activityFactor * (1 + thermicEffectPercent/100)',
     'kcal/day', N'Cálculo configurable de actividad y efecto térmico.', 0);

IF OBJECT_ID('RequirementProfiles', 'U') IS NULL
BEGIN
  CREATE TABLE RequirementProfiles (
    IdRequirementProfile UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdMealPlan UNIQUEIDENTIFIER NOT NULL UNIQUE,
    IdPaciente UNIQUEIDENTIFIER NOT NULL,
    WeightKg DECIMAL(18,6) NOT NULL,
    HeightCm DECIMAL(18,6) NOT NULL,
    AgeYears INT NOT NULL,
    Sex VARCHAR(20) NOT NULL,
    ActivityFactor DECIMAL(8,4) NOT NULL,
    ThermicEffectPercent DECIMAL(8,4) NOT NULL,
    InputsSnapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(InputsSnapshot) = 1),
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_RequirementProfiles_Plan FOREIGN KEY (IdMealPlan) REFERENCES MealPlans(IdMealPlan)
  );
END;

IF OBJECT_ID('EnergyCalculations', 'U') IS NULL
BEGIN
  CREATE TABLE EnergyCalculations (
    IdEnergyCalculation UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdRequirementProfile UNIQUEIDENTIFIER NOT NULL,
    FormulaCode VARCHAR(80) NOT NULL,
    FormulaVersion VARCHAR(30) NOT NULL,
    Inputs NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Inputs) = 1),
    BasalEnergy DECIMAL(18,6) NOT NULL,
    ActivityEnergy DECIMAL(18,6) NOT NULL,
    ThermicEffectEnergy DECIMAL(18,6) NOT NULL,
    TotalEnergy DECIMAL(18,6) NOT NULL,
    Unit VARCHAR(30) NOT NULL,
    Rounding INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_EnergyCalculations_Profile FOREIGN KEY (IdRequirementProfile)
      REFERENCES RequirementProfiles(IdRequirementProfile)
  );
END;

IF OBJECT_ID('MacroTargets', 'U') IS NULL
BEGIN
  CREATE TABLE MacroTargets (
    IdMacroTarget UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdRequirementProfile UNIQUEIDENTIFIER NOT NULL,
    NutrientCode VARCHAR(40) NOT NULL,
    PercentEnergy DECIMAL(8,4) NOT NULL,
    Kcal DECIMAL(18,6) NOT NULL,
    Grams DECIMAL(18,6) NOT NULL,
    GramsPerKg DECIMAL(18,6) NOT NULL,
    CONSTRAINT FK_MacroTargets_Profile FOREIGN KEY (IdRequirementProfile)
      REFERENCES RequirementProfiles(IdRequirementProfile),
    CONSTRAINT UQ_MacroTargets_ProfileNutrient UNIQUE (IdRequirementProfile, NutrientCode)
  );
END;

IF OBJECT_ID('NutrientTargets', 'U') IS NULL
BEGIN
  CREATE TABLE NutrientTargets (
    IdNutrientTarget UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdRequirementProfile UNIQUEIDENTIFIER NOT NULL,
    NutrientCode VARCHAR(80) NOT NULL,
    TargetAmount DECIMAL(18,6) NOT NULL,
    Unit VARCHAR(30) NOT NULL,
    CONSTRAINT FK_NutrientTargets_Profile FOREIGN KEY (IdRequirementProfile)
      REFERENCES RequirementProfiles(IdRequirementProfile)
  );
END;

IF OBJECT_ID('MealDistributions', 'U') IS NULL
BEGIN
  CREATE TABLE MealDistributions (
    IdMealDistribution UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdRequirementProfile UNIQUEIDENTIFIER NOT NULL,
    MealType NVARCHAR(80) NOT NULL,
    PercentEnergy DECIMAL(8,4) NOT NULL,
    TargetKcal DECIMAL(18,6) NOT NULL,
    TargetCarbohydrateG DECIMAL(18,6) NOT NULL,
    TargetProteinG DECIMAL(18,6) NOT NULL,
    TargetFatG DECIMAL(18,6) NOT NULL,
    Position INT NOT NULL,
    CONSTRAINT FK_MealDistributions_Profile FOREIGN KEY (IdRequirementProfile)
      REFERENCES RequirementProfiles(IdRequirementProfile)
  );
END;

IF OBJECT_ID('PlanRestrictions', 'U') IS NULL
BEGIN
  CREATE TABLE PlanRestrictions (
    IdPlanRestriction UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdMealPlan UNIQUEIDENTIFIER NOT NULL,
    RestrictionType VARCHAR(30) NOT NULL,
    Value NVARCHAR(200) NOT NULL,
    FoodId UNIQUEIDENTIFIER NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_PlanRestrictions_Plan FOREIGN KEY (IdMealPlan) REFERENCES MealPlans(IdMealPlan),
    CONSTRAINT CK_PlanRestrictions_Type CHECK (RestrictionType IN ('allergy', 'intolerance', 'excluded', 'contraindication'))
  );
END;

IF OBJECT_ID('MenuDays', 'U') IS NULL
BEGIN
  CREATE TABLE MenuDays (
    IdMenuDay UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdMealPlan UNIQUEIDENTIFIER NOT NULL,
    DayDate DATE NULL,
    Label NVARCHAR(120) NOT NULL,
    Position INT NOT NULL,
    CONSTRAINT FK_MenuDays_Plan FOREIGN KEY (IdMealPlan) REFERENCES MealPlans(IdMealPlan)
  );
END;

IF OBJECT_ID('MenuMeals', 'U') IS NULL
BEGIN
  CREATE TABLE MenuMeals (
    IdMenuMeal UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdMenuDay UNIQUEIDENTIFIER NOT NULL,
    MealType NVARCHAR(80) NOT NULL,
    MealTime TIME NULL,
    Position INT NOT NULL,
    Notes NVARCHAR(500) NULL,
    CONSTRAINT FK_MenuMeals_Day FOREIGN KEY (IdMenuDay) REFERENCES MenuDays(IdMenuDay)
  );
END;

IF OBJECT_ID('MenuItems', 'U') IS NULL
BEGIN
  CREATE TABLE MenuItems (
    IdMenuItem UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdMenuMeal UNIQUEIDENTIFIER NOT NULL,
    CatalogType VARCHAR(20) NOT NULL,
    CatalogId UNIQUEIDENTIFIER NOT NULL,
    CatalogVersion INT NOT NULL,
    CatalogSnapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(CatalogSnapshot) = 1),
    Amount DECIMAL(18,6) NOT NULL,
    AmountUnit VARCHAR(30) NOT NULL,
    NutrientSnapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(NutrientSnapshot) = 1),
    Position INT NOT NULL,
    Notes NVARCHAR(500) NULL,
    CONSTRAINT FK_MenuItems_Meal FOREIGN KEY (IdMenuMeal) REFERENCES MenuMeals(IdMenuMeal),
    CONSTRAINT CK_MenuItems_Type CHECK (CatalogType IN ('food', 'recipe'))
  );
END;

IF OBJECT_ID('MenuAdequacySnapshots', 'U') IS NULL
BEGIN
  CREATE TABLE MenuAdequacySnapshots (
    IdMenuAdequacySnapshot UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdMenuDay UNIQUEIDENTIFIER NOT NULL UNIQUE,
    CalculationVersion VARCHAR(30) NOT NULL,
    Totals NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Totals) = 1),
    Targets NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Targets) = 1),
    Adequacy NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Adequacy) = 1),
    CalculatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_MenuAdequacySnapshots_Day FOREIGN KEY (IdMenuDay) REFERENCES MenuDays(IdMenuDay)
  );
END;

IF OBJECT_ID('MealPlanVersions', 'U') IS NULL
BEGIN
  CREATE TABLE MealPlanVersions (
    IdMealPlanVersion UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdMealPlan UNIQUEIDENTIFIER NOT NULL,
    VersionNumber INT NOT NULL,
    Snapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Snapshot) = 1),
    PublishedBy INT NOT NULL,
    PublishedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_MealPlanVersions_Plan FOREIGN KEY (IdMealPlan) REFERENCES MealPlans(IdMealPlan),
    CONSTRAINT UQ_MealPlanVersions_Number UNIQUE (IdMealPlan, VersionNumber)
  );
END;

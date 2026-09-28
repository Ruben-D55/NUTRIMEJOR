IF OBJECT_ID('Nutrients', 'U') IS NULL
BEGIN
  CREATE TABLE Nutrients (
    IdNutrient UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Code VARCHAR(80) NOT NULL UNIQUE,
    Name NVARCHAR(160) NOT NULL,
    Unit VARCHAR(30) NOT NULL,
    NutrientGroup VARCHAR(60) NOT NULL,
    DecimalPlaces INT NOT NULL DEFAULT 2,
    Version INT NOT NULL DEFAULT 1,
    Active BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

MERGE Nutrients AS target
USING (VALUES
  ('energy_kcal', N'Energía', 'kcal', 'energy', 2),
  ('carbohydrate_g', N'Carbohidratos', 'g', 'macronutrient', 2),
  ('protein_g', N'Proteínas', 'g', 'macronutrient', 2),
  ('fat_g', N'Grasas', 'g', 'macronutrient', 2),
  ('fiber_g', N'Fibra', 'g', 'macronutrient', 2),
  ('sodium_mg', N'Sodio', 'mg', 'mineral', 2)
) AS source (Code, Name, Unit, NutrientGroup, DecimalPlaces)
ON target.Code=source.Code
WHEN NOT MATCHED THEN
  INSERT (Code, Name, Unit, NutrientGroup, DecimalPlaces)
  VALUES (source.Code, source.Name, source.Unit, source.NutrientGroup, source.DecimalPlaces);

IF OBJECT_ID('Foods', 'U') IS NULL
BEGIN
  CREATE TABLE Foods (
    IdFood UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NULL,
    IdNutricionista INT NULL,
    Scope VARCHAR(20) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    Category NVARCHAR(120) NOT NULL,
    Description NVARCHAR(1000) NULL,
    Brand NVARCHAR(160) NULL,
    SourceName NVARCHAR(240) NULL,
    SourceReference NVARCHAR(500) NULL,
    LicenseName NVARCHAR(240) NULL,
    Version INT NOT NULL DEFAULT 1,
    Active BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Foods_Scope CHECK (Scope IN ('GLOBAL', 'ORGANIZATION', 'PROFESSIONAL')),
    CONSTRAINT CK_Foods_Ownership CHECK (
      (Scope='GLOBAL' AND IdOrganizacion IS NULL AND IdNutricionista IS NULL
        AND SourceName IS NOT NULL AND LicenseName IS NOT NULL)
      OR (Scope='ORGANIZATION' AND IdOrganizacion IS NOT NULL)
      OR (Scope='PROFESSIONAL' AND IdOrganizacion IS NOT NULL AND IdNutricionista IS NOT NULL)
    )
  );
  CREATE INDEX IX_Foods_Visibility ON Foods (Scope, IdOrganizacion, IdNutricionista, Active, Name);
END;

IF OBJECT_ID('FoodNutrients', 'U') IS NULL
BEGIN
  CREATE TABLE FoodNutrients (
    IdFood UNIQUEIDENTIFIER NOT NULL,
    IdNutrient UNIQUEIDENTIFIER NOT NULL,
    AmountPer100g DECIMAL(18,6) NOT NULL,
    SourceReference NVARCHAR(500) NULL,
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_FoodNutrients PRIMARY KEY (IdFood, IdNutrient),
    CONSTRAINT FK_FoodNutrients_Food FOREIGN KEY (IdFood) REFERENCES Foods(IdFood),
    CONSTRAINT FK_FoodNutrients_Nutrient FOREIGN KEY (IdNutrient) REFERENCES Nutrients(IdNutrient),
    CONSTRAINT CK_FoodNutrients_Amount CHECK (AmountPer100g >= 0)
  );
END;

IF OBJECT_ID('HouseholdMeasures', 'U') IS NULL
BEGIN
  CREATE TABLE HouseholdMeasures (
    IdHouseholdMeasure UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdNutricionista INT NOT NULL,
    Name NVARCHAR(120) NOT NULL,
    Abbreviation NVARCHAR(30) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_HouseholdMeasures_OwnerName UNIQUE (IdOrganizacion, IdNutricionista, Name)
  );
END;

IF OBJECT_ID('FoodPortions', 'U') IS NULL
BEGIN
  CREATE TABLE FoodPortions (
    IdFoodPortion UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdFood UNIQUEIDENTIFIER NOT NULL,
    IdHouseholdMeasure UNIQUEIDENTIFIER NULL,
    Name NVARCHAR(120) NOT NULL,
    Grams DECIMAL(18,6) NOT NULL,
    Version INT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_FoodPortions_Food FOREIGN KEY (IdFood) REFERENCES Foods(IdFood),
    CONSTRAINT FK_FoodPortions_Measure FOREIGN KEY (IdHouseholdMeasure) REFERENCES HouseholdMeasures(IdHouseholdMeasure),
    CONSTRAINT CK_FoodPortions_Grams CHECK (Grams > 0)
  );
END;

IF OBJECT_ID('Recipes', 'U') IS NULL
BEGIN
  CREATE TABLE Recipes (
    IdRecipe UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NULL,
    IdNutricionista INT NULL,
    Scope VARCHAR(20) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(1000) NULL,
    PhotoPath NVARCHAR(500) NULL,
    Instructions NVARCHAR(MAX) NOT NULL,
    PreparationMinutes INT NULL,
    Category NVARCHAR(120) NOT NULL,
    Servings DECIMAL(10,2) NOT NULL,
    YieldGrams DECIMAL(18,6) NULL,
    Version INT NOT NULL DEFAULT 1,
    Active BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Recipes_Scope CHECK (Scope IN ('GLOBAL', 'ORGANIZATION', 'PROFESSIONAL')),
    CONSTRAINT CK_Recipes_Servings CHECK (Servings > 0),
    CONSTRAINT CK_Recipes_Ownership CHECK (
      (Scope='GLOBAL' AND IdOrganizacion IS NULL AND IdNutricionista IS NULL)
      OR (Scope='ORGANIZATION' AND IdOrganizacion IS NOT NULL)
      OR (Scope='PROFESSIONAL' AND IdOrganizacion IS NOT NULL AND IdNutricionista IS NOT NULL)
    )
  );
  CREATE INDEX IX_Recipes_Visibility ON Recipes (Scope, IdOrganizacion, IdNutricionista, Active, Name);
END;

IF OBJECT_ID('RecipeIngredients', 'U') IS NULL
BEGIN
  CREATE TABLE RecipeIngredients (
    IdRecipeIngredient UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdRecipe UNIQUEIDENTIFIER NOT NULL,
    IdFood UNIQUEIDENTIFIER NOT NULL,
    AmountGrams DECIMAL(18,6) NOT NULL,
    FoodVersion INT NOT NULL,
    FoodSnapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(FoodSnapshot) = 1),
    Notes NVARCHAR(300) NULL,
    Position INT NOT NULL,
    CONSTRAINT FK_RecipeIngredients_Recipe FOREIGN KEY (IdRecipe) REFERENCES Recipes(IdRecipe),
    CONSTRAINT FK_RecipeIngredients_Food FOREIGN KEY (IdFood) REFERENCES Foods(IdFood),
    CONSTRAINT CK_RecipeIngredients_Amount CHECK (AmountGrams > 0)
  );
END;

IF OBJECT_ID('RecipeNutrients', 'U') IS NULL
BEGIN
  CREATE TABLE RecipeNutrients (
    IdRecipe UNIQUEIDENTIFIER NOT NULL,
    IdNutrient UNIQUEIDENTIFIER NOT NULL,
    TotalAmount DECIMAL(18,6) NOT NULL,
    AmountPerServing DECIMAL(18,6) NOT NULL,
    CalculationVersion VARCHAR(30) NOT NULL,
    InputsSnapshot NVARCHAR(MAX) NOT NULL CHECK (ISJSON(InputsSnapshot) = 1),
    CalculatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_RecipeNutrients PRIMARY KEY (IdRecipe, IdNutrient),
    CONSTRAINT FK_RecipeNutrients_Recipe FOREIGN KEY (IdRecipe) REFERENCES Recipes(IdRecipe),
    CONSTRAINT FK_RecipeNutrients_Nutrient FOREIGN KEY (IdNutrient) REFERENCES Nutrients(IdNutrient)
  );
END;

IF OBJECT_ID('CatalogTags', 'U') IS NULL
BEGIN
  CREATE TABLE CatalogTags (
    IdCatalogTag UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_CatalogTags_OrganizationName UNIQUE (IdOrganizacion, Name)
  );
END;

IF OBJECT_ID('RecipeTags', 'U') IS NULL
BEGIN
  CREATE TABLE RecipeTags (
    IdRecipe UNIQUEIDENTIFIER NOT NULL,
    IdCatalogTag UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_RecipeTags PRIMARY KEY (IdRecipe, IdCatalogTag),
    CONSTRAINT FK_RecipeTags_Recipe FOREIGN KEY (IdRecipe) REFERENCES Recipes(IdRecipe),
    CONSTRAINT FK_RecipeTags_Tag FOREIGN KEY (IdCatalogTag) REFERENCES CatalogTags(IdCatalogTag)
  );
END;

IF OBJECT_ID('Recommendations', 'U') IS NULL
BEGIN
  CREATE TABLE Recommendations (
    IdRecommendation UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdNutricionista INT NOT NULL,
    Category NVARCHAR(120) NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Content NVARCHAR(MAX) NOT NULL,
    Tags NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(Tags) = 1),
    Active BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('EducationResources', 'U') IS NULL
BEGIN
  CREATE TABLE EducationResources (
    IdEducationResource UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdNutricionista INT NOT NULL,
    ResourceType VARCHAR(30) NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Description NVARCHAR(1000) NULL,
    StoragePath NVARCHAR(500) NOT NULL,
    Tags NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(Tags) = 1),
    Active BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_EducationResources_Type CHECK (ResourceType IN ('pdf', 'image', 'infographic', 'guide', 'other'))
  );
END;

IF OBJECT_ID('LegacyCatalogImports', 'U') IS NULL
BEGIN
  CREATE TABLE LegacyCatalogImports (
    IdCatalogo UNIQUEIDENTIFIER PRIMARY KEY,
    TargetType VARCHAR(30) NOT NULL,
    TargetId UNIQUEIDENTIFIER NOT NULL,
    ImportedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

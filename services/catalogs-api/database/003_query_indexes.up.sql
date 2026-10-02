IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Recommendations_OrganizationActive' AND object_id=OBJECT_ID('Recommendations'))
  CREATE INDEX IX_Recommendations_OrganizationActive ON Recommendations (IdOrganizacion, Active, Category, Title) INCLUDE (IdNutricionista, UpdatedAt);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_EducationResources_OrganizationActive' AND object_id=OBJECT_ID('EducationResources'))
  CREATE INDEX IX_EducationResources_OrganizationActive ON EducationResources (IdOrganizacion, Active, Title) INCLUDE (ResourceType, IdNutricionista);

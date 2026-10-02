IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_EducationResources_OrganizationActive' AND object_id=OBJECT_ID('EducationResources'))
  DROP INDEX IX_EducationResources_OrganizationActive ON EducationResources;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Recommendations_OrganizationActive' AND object_id=OBJECT_ID('Recommendations'))
  DROP INDEX IX_Recommendations_OrganizationActive ON Recommendations;

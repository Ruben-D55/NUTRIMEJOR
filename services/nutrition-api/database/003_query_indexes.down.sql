IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_FoodFrequencyAssessments_Assessment' AND object_id=OBJECT_ID('FoodFrequencyAssessments')) DROP INDEX IX_FoodFrequencyAssessments_Assessment ON FoodFrequencyAssessments;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Recall24h_Assessment' AND object_id=OBJECT_ID('Recall24h')) DROP INDEX IX_Recall24h_Assessment ON Recall24h;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DietaryAssessments_Assessment' AND object_id=OBJECT_ID('DietaryAssessments')) DROP INDEX IX_DietaryAssessments_Assessment ON DietaryAssessments;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_LifestyleAssessments_Assessment' AND object_id=OBJECT_ID('LifestyleAssessments')) DROP INDEX IX_LifestyleAssessments_Assessment ON LifestyleAssessments;

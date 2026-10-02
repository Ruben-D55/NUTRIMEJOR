IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_LifestyleAssessments_Assessment' AND object_id=OBJECT_ID('LifestyleAssessments'))
  CREATE INDEX IX_LifestyleAssessments_Assessment ON LifestyleAssessments (IdNutritionAssessment);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DietaryAssessments_Assessment' AND object_id=OBJECT_ID('DietaryAssessments'))
  CREATE INDEX IX_DietaryAssessments_Assessment ON DietaryAssessments (IdNutritionAssessment);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Recall24h_Assessment' AND object_id=OBJECT_ID('Recall24h'))
  CREATE INDEX IX_Recall24h_Assessment ON Recall24h (IdNutritionAssessment);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_FoodFrequencyAssessments_Assessment' AND object_id=OBJECT_ID('FoodFrequencyAssessments'))
  CREATE INDEX IX_FoodFrequencyAssessments_Assessment ON FoodFrequencyAssessments (IdNutritionAssessment);

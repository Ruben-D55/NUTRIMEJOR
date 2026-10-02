IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_MenuDays_PlanPosition' AND object_id=OBJECT_ID('MenuDays'))
  CREATE INDEX IX_MenuDays_PlanPosition ON MenuDays (IdMealPlan, Position);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PlanRestrictions_Plan' AND object_id=OBJECT_ID('PlanRestrictions'))
  CREATE INDEX IX_PlanRestrictions_Plan ON PlanRestrictions (IdMealPlan, RestrictionType);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_MealPlanVersions_PlanVersion' AND object_id=OBJECT_ID('MealPlanVersions'))
  CREATE INDEX IX_MealPlanVersions_PlanVersion ON MealPlanVersions (IdOrganizacion, IdMealPlan, VersionNumber);

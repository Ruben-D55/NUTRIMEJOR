IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_MealPlanVersions_PlanVersion' AND object_id=OBJECT_ID('MealPlanVersions')) DROP INDEX IX_MealPlanVersions_PlanVersion ON MealPlanVersions;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PlanRestrictions_Plan' AND object_id=OBJECT_ID('PlanRestrictions')) DROP INDEX IX_PlanRestrictions_Plan ON PlanRestrictions;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_MenuDays_PlanPosition' AND object_id=OBJECT_ID('MenuDays')) DROP INDEX IX_MenuDays_PlanPosition ON MenuDays;

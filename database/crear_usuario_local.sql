USE master;
GO

IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = 'nutrimejor_app')
BEGIN
    CREATE LOGIN nutrimejor_app WITH PASSWORD = 'CAMBIAR_ANTES_DE_EJECUTAR_2026!';
END;
GO

USE Nutrimejor;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'nutrimejor_app')
BEGIN
    CREATE USER nutrimejor_app FOR LOGIN nutrimejor_app;
END;
GO

ALTER ROLE db_datareader ADD MEMBER nutrimejor_app;
ALTER ROLE db_datawriter ADD MEMBER nutrimejor_app;
GO

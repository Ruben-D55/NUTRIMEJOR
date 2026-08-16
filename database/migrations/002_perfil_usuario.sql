USE Nutrimejor;
GO
IF COL_LENGTH('Usuarios','Matricula') IS NULL ALTER TABLE Usuarios ADD Matricula NVARCHAR(80) NULL;
IF COL_LENGTH('Usuarios','Especialidad') IS NULL ALTER TABLE Usuarios ADD Especialidad NVARCHAR(120) NULL;
IF COL_LENGTH('Usuarios','Apariencia') IS NULL ALTER TABLE Usuarios ADD Apariencia VARCHAR(10) NOT NULL CONSTRAINT DF_Usuarios_Apariencia DEFAULT 'system';
GO

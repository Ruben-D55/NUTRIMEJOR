IF OBJECT_ID('Catalogos', 'U') IS NULL
BEGIN
  CREATE TABLE Catalogos (
    IdCatalogo UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NULL,
    IdNutricionista INT NOT NULL,
    Tipo VARCHAR(20) NOT NULL CHECK (Tipo IN ('recetas', 'alimentos', 'dietas')),
    Nombre NVARCHAR(150) NOT NULL,
    Descripcion NVARCHAR(1000) NULL,
    Calorias DECIMAL(9,2) NOT NULL DEFAULT 0,
    Extra NVARCHAR(250) NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Catalogos_Propietario
    ON Catalogos (IdNutricionista, Tipo, FechaActualizacion DESC);
END;

IF COL_LENGTH('Catalogos', 'IdOrganizacion') IS NULL
BEGIN
  ALTER TABLE Catalogos ADD IdOrganizacion UNIQUEIDENTIFIER NULL;
END;

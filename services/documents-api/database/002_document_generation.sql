IF COL_LENGTH('DocumentRequests', 'DocumentType') IS NULL
BEGIN
  ALTER TABLE DocumentRequests ADD
    DocumentType VARCHAR(50) NULL,
    TemplateId UNIQUEIDENTIFIER NULL,
    Payload NVARCHAR(MAX) NULL,
    StoragePath NVARCHAR(1000) NULL,
    ContentType VARCHAR(100) NULL,
    FileSize BIGINT NULL,
    Sha256 CHAR(64) NULL,
    RequestedAt DATETIME2 NULL,
    ProcessingStartedAt DATETIME2 NULL,
    CompletedAt DATETIME2 NULL,
    FailureReason NVARCHAR(1000) NULL;
END;

IF OBJECT_ID('DocumentTemplates', 'U') IS NULL
BEGIN
  CREATE TABLE DocumentTemplates (
    IdDocumentTemplate UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    DocumentType VARCHAR(50) NOT NULL,
    Definition NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Definition)=1),
    Active BIT NOT NULL DEFAULT 1,
    Version INT NOT NULL DEFAULT 1,
    CreatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_DocumentTemplates_OrganizationType
    ON DocumentTemplates (IdOrganizacion, DocumentType, Active);
END;

IF OBJECT_ID('DocumentAccessTokens', 'U') IS NULL
BEGIN
  CREATE TABLE DocumentAccessTokens (
    IdDocumentAccessToken UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    IdOrganizacion UNIQUEIDENTIFIER NOT NULL,
    IdDocumentRequest UNIQUEIDENTIFIER NOT NULL,
    TokenHash CHAR(64) NOT NULL UNIQUE,
    ExpiresAt DATETIME2 NOT NULL,
    CreatedBy INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_DocumentAccessTokens_Request
      FOREIGN KEY (IdDocumentRequest) REFERENCES DocumentRequests(IdDocumentRequest)
  );
  CREATE INDEX IX_DocumentAccessTokens_Expiry ON DocumentAccessTokens (ExpiresAt);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DocumentRequests_WorkQueue')
  EXEC(N'CREATE INDEX IX_DocumentRequests_WorkQueue
    ON DocumentRequests (Estado, RequestedAt)');

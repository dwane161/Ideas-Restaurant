-- Adds client fields to App_Orders so each order can persist its selected client.
-- Run this in your MSSQL database (db_a40f58_tituabar).

IF COL_LENGTH('dbo.App_Orders', 'clientId') IS NULL
  ALTER TABLE dbo.App_Orders ADD clientId NVARCHAR(20) NULL;

IF COL_LENGTH('dbo.App_Orders', 'clientName') IS NULL
  ALTER TABLE dbo.App_Orders ADD clientName NVARCHAR(80) NULL;

IF COL_LENGTH('dbo.App_Orders', 'beneficiary') IS NULL
  ALTER TABLE dbo.App_Orders ADD beneficiary NVARCHAR(100) NULL;

-- Optional index for lookups
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_App_Orders_clientId' AND object_id = OBJECT_ID('dbo.App_Orders')
)
  CREATE INDEX IX_App_Orders_clientId ON dbo.App_Orders (clientId);


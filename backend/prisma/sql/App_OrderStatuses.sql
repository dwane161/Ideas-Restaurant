-- Order status catalog used by the mobile app.
-- Run this in your MSSQL database (db_a40f58_tituabar).

IF OBJECT_ID(N'dbo.App_OrderStatuses', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.App_OrderStatuses (
    code        NVARCHAR(20) NOT NULL,
    label       NVARCHAR(50) NOT NULL,
    tableStatus NVARCHAR(20) NOT NULL,
    color       NVARCHAR(20) NULL,
    sortOrder   INT NOT NULL CONSTRAINT DF_App_OrderStatuses_sortOrder DEFAULT (0),
    isActive    BIT NOT NULL CONSTRAINT DF_App_OrderStatuses_isActive DEFAULT (1),
    CONSTRAINT PK_App_OrderStatuses PRIMARY KEY CLUSTERED (code)
  );
END;
GO

-- Seed (idempotent)
;MERGE dbo.App_OrderStatuses AS target
USING (VALUES
  (N'open',     N'OCUPADA',   N'occupied',  N'slate',  10, 1),
  (N'paid',     N'PAGADO',    N'pending',   N'orange', 20, 1),
  (N'cleaning', N'LIMPIANDO', N'cleaning',  N'yellow', 30, 1),
  (N'closed',   N'DISPONIBLE',N'available', N'green',  40, 1)
) AS source (code, label, tableStatus, color, sortOrder, isActive)
ON target.code = source.code
WHEN MATCHED THEN
  UPDATE SET
    label = source.label,
    tableStatus = source.tableStatus,
    color = source.color,
    sortOrder = source.sortOrder,
    isActive = source.isActive
WHEN NOT MATCHED THEN
  INSERT (code, label, tableStatus, color, sortOrder, isActive)
  VALUES (source.code, source.label, source.tableStatus, source.color, source.sortOrder, source.isActive);
GO

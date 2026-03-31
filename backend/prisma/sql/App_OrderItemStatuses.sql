-- Order item status catalog used by the mobile app.
-- Run this in your MSSQL database (db_a40f58_tituabar).

IF OBJECT_ID(N'dbo.App_OrderItemStatuses', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.App_OrderItemStatuses (
    code      NVARCHAR(20) NOT NULL,
    label     NVARCHAR(50) NOT NULL,
    color     NVARCHAR(20) NULL,
    sortOrder INT NOT NULL CONSTRAINT DF_App_OrderItemStatuses_sortOrder DEFAULT (0),
    isActive  BIT NOT NULL CONSTRAINT DF_App_OrderItemStatuses_isActive DEFAULT (1),
    CONSTRAINT PK_App_OrderItemStatuses PRIMARY KEY CLUSTERED (code)
  );
END;

-- Seed without MERGE (idempotent)
DECLARE @src TABLE (
  code      NVARCHAR(20) NOT NULL,
  label     NVARCHAR(50) NOT NULL,
  color     NVARCHAR(20) NULL,
  sortOrder INT NOT NULL,
  isActive  BIT NOT NULL
);

INSERT INTO @src (code, label, color, sortOrder, isActive) VALUES
(N'pending',      N'PENDIENTE',  N'orange', 10, 1),
(N'in_progress',  N'EN PREP',    N'blue',   20, 1),
(N'completed',    N'LISTO',      N'green',  30, 1),
(N'cancelled',    N'CANCELADO',  N'slate',  40, 1);

UPDATE t
SET
  t.label = s.label,
  t.color = s.color,
  t.sortOrder = s.sortOrder,
  t.isActive = s.isActive
FROM dbo.App_OrderItemStatuses t
JOIN @src s ON s.code = t.code;

INSERT INTO dbo.App_OrderItemStatuses (code, label, color, sortOrder, isActive)
SELECT s.code, s.label, s.color, s.sortOrder, s.isActive
FROM @src s
WHERE NOT EXISTS (SELECT 1 FROM dbo.App_OrderItemStatuses t WHERE t.code = s.code);


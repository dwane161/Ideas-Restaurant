-- Android update settings used by GET /api/app-update/android.
-- Run this in the tenant database (for example db_a40f58_tituabar).

IF OBJECT_ID(N'dbo.App_Settings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.App_Settings (
    SettingKey NVARCHAR(100) NOT NULL CONSTRAINT PK_App_Settings PRIMARY KEY,
    SettingValue NVARCHAR(MAX) NULL,
    CreatedAt DATETIME NOT NULL CONSTRAINT DF_App_Settings_CreatedAt DEFAULT (GETDATE()),
    UpdatedAt DATETIME NOT NULL CONSTRAINT DF_App_Settings_UpdatedAt DEFAULT (GETDATE())
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.App_Settings WHERE SettingKey = N'app.android.enabled')
  INSERT INTO dbo.App_Settings (SettingKey, SettingValue) VALUES (N'app.android.enabled', N'false');

IF NOT EXISTS (SELECT 1 FROM dbo.App_Settings WHERE SettingKey = N'app.android.latestVersionCode')
  INSERT INTO dbo.App_Settings (SettingKey, SettingValue) VALUES (N'app.android.latestVersionCode', N'1');

IF NOT EXISTS (SELECT 1 FROM dbo.App_Settings WHERE SettingKey = N'app.android.latestVersionName')
  INSERT INTO dbo.App_Settings (SettingKey, SettingValue) VALUES (N'app.android.latestVersionName', N'1.0.0');

IF NOT EXISTS (SELECT 1 FROM dbo.App_Settings WHERE SettingKey = N'app.android.minSupportedVersionCode')
  INSERT INTO dbo.App_Settings (SettingKey, SettingValue) VALUES (N'app.android.minSupportedVersionCode', N'1');

IF NOT EXISTS (SELECT 1 FROM dbo.App_Settings WHERE SettingKey = N'app.android.apkUrl')
  INSERT INTO dbo.App_Settings (SettingKey, SettingValue) VALUES (N'app.android.apkUrl', N'https://ideasos-001-site11.mtempurl.com/downloads/ideas-restaurant.apk');

IF NOT EXISTS (SELECT 1 FROM dbo.App_Settings WHERE SettingKey = N'app.android.releaseNotes')
  INSERT INTO dbo.App_Settings (SettingKey, SettingValue) VALUES (N'app.android.releaseNotes', N'Nueva versión disponible.');

IF NOT EXISTS (SELECT 1 FROM dbo.App_Settings WHERE SettingKey = N'app.android.required')
  INSERT INTO dbo.App_Settings (SettingKey, SettingValue) VALUES (N'app.android.required', N'false');
GO

-- To publish an update later, upload the APK and update these values:
-- UPDATE dbo.App_Settings SET SettingValue = N'true' WHERE SettingKey = N'app.android.enabled';
-- UPDATE dbo.App_Settings SET SettingValue = N'2' WHERE SettingKey = N'app.android.latestVersionCode';
-- UPDATE dbo.App_Settings SET SettingValue = N'1.0.1' WHERE SettingKey = N'app.android.latestVersionName';
-- UPDATE dbo.App_Settings SET SettingValue = N'https://ideasos-001-site11.mtempurl.com/downloads/ideas-restaurant-1.0.1.apk' WHERE SettingKey = N'app.android.apkUrl';

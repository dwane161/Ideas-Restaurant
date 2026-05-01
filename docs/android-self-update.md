# Android self-update via HostBuddy

This project supports private Android updates outside Play Store.

## GitHub secrets

Create these repository secrets in GitHub:

- `ANDROID_KEYSTORE_BASE64`: base64 content of the release `.jks`.
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `FTP_SERVER`
- `FTP_USERNAME`
- `FTP_PASSWORD`
- `APK_FTP_SERVER_DIR`: FTP folder exposed publicly, for example `/wwwroot/downloads/`.
- `APK_PUBLIC_BASE_URL`: public URL for that folder, without trailing slash, for example `https://ideasos-001-site11.mtempurl.com/downloads`.
- `APP_DATABASE_URL`: SQL Server URL for the tenant DB where `App_Settings` lives.

## Publish flow

Every push to `main` runs `Publish Android Update` automatically.

The workflow:

1. Generates a higher Android version automatically:
   - `versionCode = 1000 + GITHUB_RUN_NUMBER`
   - `versionName = 1.0.GITHUB_RUN_NUMBER`
2. Builds the signed APK.
3. Uploads it to HostBuddy FTP.
4. Updates `App_Settings` with the new version and APK URL.

You can also run GitHub Actions -> `Publish Android Update` manually to customize release notes and whether the update is required.

The Android app checks:

```txt
GET /api/app-update/android
```

If `latestVersionCode` is greater than the installed `versionCode`, it prompts the user to download the APK.

## Notes

- The APK must always be signed with the same keystore, or Android will not install it over the existing app.
- Devices must allow installation from the browser/app used to open the APK.
- The first installed app version that can show update prompts must include `AppUpdateService`; older installed versions cannot self-update until updated once manually.
- `android/app/build.gradle` still has fallback version values for local builds, but GitHub Actions overrides them through `ANDROID_VERSION_CODE` and `ANDROID_VERSION_NAME`.

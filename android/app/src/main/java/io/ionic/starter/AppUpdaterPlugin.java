package io.ionic.starter;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
  private final ExecutorService executor = Executors.newSingleThreadExecutor();

  @Override
  public void load() {
    super.load();
    Log.i("AppUpdater", "AppUpdaterPlugin loaded");
  }

  @PluginMethod
  public void canInstallPackages(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("allowed", canRequestPackageInstalls());
    call.resolve(ret);
  }

  @PluginMethod
  public void openInstallPermissionSettings(PluginCall call) {
    try {
      Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
      intent.setData(Uri.parse("package:" + getContext().getPackageName()));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
      JSObject ret = new JSObject();
      ret.put("ok", true);
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("No se pudo abrir la configuración de instalación: " + e.getMessage());
    }
  }

  @PluginMethod
  public void downloadAndInstall(PluginCall call) {
    String url = call.getString("url", "");
    String fileName = call.getString("fileName", "ideas-restaurant-update.apk");

    if (url == null || url.trim().isEmpty()) {
      call.reject("Falta la URL del APK.");
      return;
    }

    if (!canRequestPackageInstalls()) {
      call.reject("Android requiere habilitar la instalación de apps desconocidas para esta app.");
      openUnknownSourcesSettings();
      return;
    }

    executor.execute(() -> {
      File apkFile = null;
      try {
        notifyProgress(0, 0, 0, "downloading");
        apkFile = downloadApk(url, sanitizeApkName(fileName));
        notifyProgress(100, apkFile.length(), apkFile.length(), "installing");
        openInstaller(apkFile);

        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("path", apkFile.getAbsolutePath());
        call.resolve(ret);
      } catch (Exception e) {
        notifyProgress(0, 0, 0, "error");
        call.reject("No se pudo descargar o instalar la actualización: " + e.getMessage());
      }
    });
  }

  private File downloadApk(String urlValue, String fileName) throws Exception {
    HttpURLConnection connection = null;
    try {
      URL url = new URL(urlValue);
      connection = (HttpURLConnection) url.openConnection();
      connection.setInstanceFollowRedirects(true);
      connection.setConnectTimeout(20000);
      connection.setReadTimeout(60000);
      connection.connect();

      int status = connection.getResponseCode();
      if (status < 200 || status >= 300) {
        throw new IllegalStateException("HTTP " + status);
      }

      int total = connection.getContentLength();
      File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
      if (dir == null) {
        dir = new File(getContext().getCacheDir(), "updates");
      }
      if (!dir.exists() && !dir.mkdirs()) {
        throw new IllegalStateException("No se pudo crear la carpeta de descarga.");
      }

      File apkFile = new File(dir, fileName);
      byte[] buffer = new byte[32 * 1024];
      long downloaded = 0;
      int lastPercent = -1;

      try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(apkFile, false)) {
        int read;
        while ((read = input.read(buffer)) != -1) {
          output.write(buffer, 0, read);
          downloaded += read;

          int percent = total > 0 ? (int) Math.min(99, (downloaded * 100) / total) : 0;
          if (percent != lastPercent) {
            lastPercent = percent;
            notifyProgress(percent, downloaded, total, "downloading");
          }
        }
      }

      if (apkFile.length() <= 0) {
        throw new IllegalStateException("El APK descargado está vacío.");
      }
      return apkFile;
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  private void openInstaller(File apkFile) {
    Context context = getContext();
    Uri apkUri = FileProvider.getUriForFile(
        context,
        context.getPackageName() + ".fileprovider",
        apkFile
    );

    Intent intent = new Intent(Intent.ACTION_VIEW);
    intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    context.startActivity(intent);
  }

  private boolean canRequestPackageInstalls() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
    PackageManager pm = getContext().getPackageManager();
    return pm.canRequestPackageInstalls();
  }

  private void openUnknownSourcesSettings() {
    try {
      Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
      intent.setData(Uri.parse("package:" + getContext().getPackageName()));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
    } catch (Exception ignored) {
    }
  }

  private void notifyProgress(int percent, long downloadedBytes, long totalBytes, String state) {
    JSObject data = new JSObject();
    data.put("percent", percent);
    data.put("downloadedBytes", downloadedBytes);
    data.put("totalBytes", totalBytes);
    data.put("state", state);
    notifyListeners("downloadProgress", data);
  }

  private static String sanitizeApkName(String value) {
    String name = value == null ? "" : value.trim();
    if (name.isEmpty()) name = "ideas-restaurant-update.apk";
    name = name.replaceAll("[^A-Za-z0-9._-]", "-");
    if (!name.toLowerCase(Locale.ROOT).endsWith(".apk")) name += ".apk";
    return name;
  }
}

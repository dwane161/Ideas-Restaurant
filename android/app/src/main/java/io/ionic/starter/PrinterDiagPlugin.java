package io.ionic.starter;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "PrinterDiag")
public class PrinterDiagPlugin extends Plugin {

  @Override
  public void load() {
    super.load();
    Log.i("PrinterDiag", "PrinterDiagPlugin loaded");
  }

  @PluginMethod
  public void getDiagnostics(PluginCall call) {
    JSObject ret = new JSObject();

    JSObject device = new JSObject();
    device.put("manufacturer", safe(Build.MANUFACTURER));
    device.put("brand", safe(Build.BRAND));
    device.put("model", safe(Build.MODEL));
    device.put("device", safe(Build.DEVICE));
    device.put("product", safe(Build.PRODUCT));
    device.put("sdkInt", Build.VERSION.SDK_INT);
    device.put("release", safe(Build.VERSION.RELEASE));
    ret.put("device", device);

    JSArray packagesOut = new JSArray();
    try {
      Context ctx = getContext();
      PackageManager pm = ctx.getPackageManager();
      for (PackageInfo pi : pm.getInstalledPackages(0)) {
        String name = pi.packageName != null ? pi.packageName : "";
        if (looksLikePrinterPackage(name)) {
          JSObject p = new JSObject();
          p.put("packageName", name);
          packagesOut.put(p);
        }
      }
    } catch (Exception e) {
      ret.put("packagesError", safe(e.getMessage()));
    }

    ret.put("printerPackages", packagesOut);
    call.resolve(ret);
  }

  private static boolean looksLikePrinterPackage(String packageName) {
    String p = packageName.toLowerCase(Locale.ROOT);
    return p.contains("printer") ||
      p.contains("print") ||
      p.contains("woyou") ||     // Sunmi
      p.contains("sunmi") ||
      p.contains("imin") ||      // iMin
      p.contains("pax") ||       // PAX
      p.contains("rugtek") ||
      p.contains("rongta") ||    // Rongta
      p.contains("rtprinter") ||
      p.contains("sewoo") ||
      p.contains("bixolon") ||
      p.contains("zebra") ||
      p.contains("gprinter") ||
      p.contains("hprt") ||
      p.contains("escpos") ||
      p.contains("pos");
  }

  private static String safe(String v) {
    return v == null ? "" : v;
  }
}

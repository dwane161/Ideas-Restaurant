package io.ionic.starter;

import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // IMPORTANT: Register custom plugins BEFORE calling super.onCreate(),
    // otherwise Capacitor may not load them into the Bridge.
    Log.i("PrinterDiag", "Registering PrinterDiagPlugin");
    registerPlugin(PrinterDiagPlugin.class);
    Log.i("AndroidPrinter", "Registering AndroidPrinterPlugin");
    registerPlugin(AndroidPrinterPlugin.class);
    Log.i("AppUpdater", "Registering AppUpdaterPlugin");
    registerPlugin(AppUpdaterPlugin.class);

    super.onCreate(savedInstanceState);

    WebView webView = this.getBridge().getWebView();
    WebSettings settings = webView.getSettings();

    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
  }
}

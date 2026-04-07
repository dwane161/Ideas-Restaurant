package io.ionic.starter;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Log;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidPrinter")
public class AndroidPrinterPlugin extends Plugin {

  @Override
  public void load() {
    super.load();
    Log.i("AndroidPrinter", "AndroidPrinterPlugin loaded");
  }

  private void printHtmlInternal(PluginCall call, String name, String html) {
    if (html == null || html.trim().isEmpty()) {
      call.reject("Missing html");
      return;
    }

    if (getActivity() == null) {
      call.reject("Activity not available");
      return;
    }

    getActivity()
        .runOnUiThread(
            () -> {
              try {
                Context context = getActivity();
                PrintManager printManager = (PrintManager) context.getSystemService(Context.PRINT_SERVICE);
                if (printManager == null) {
                  call.reject("PrintManager not available");
                  return;
                }

                WebView webView = new WebView(context);
                webView.getSettings().setJavaScriptEnabled(false);
                webView.setWebViewClient(
                    new WebViewClient() {
                      @Override
                      public void onPageFinished(WebView view, String url) {
                        try {
                          String jobName = name != null ? name : "Documento";
                          printManager.print(
                              jobName,
                              view.createPrintDocumentAdapter(jobName),
                              new PrintAttributes.Builder().build());
                          JSObject ret = new JSObject();
                          ret.put("ok", true);
                          call.resolve(ret);
                        } catch (Exception e) {
                          call.reject("Print failed: " + e.getMessage());
                        }
                      }
                    });

                webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
              } catch (Exception e) {
                call.reject("Print failed: " + e.getMessage());
              }
            });
  }

  @PluginMethod
  public void printHtml(PluginCall call) {
    String name = call.getString("name", "Documento");
    String html = call.getString("html", "");
    printHtmlInternal(call, name, html);
  }

  @PluginMethod
  public void printText(PluginCall call) {
    String name = call.getString("name", "Documento");
    String text = call.getString("text", "");
    if (text == null) text = "";
    // Simple HTML to preserve whitespace.
    String html =
        "<html><head><meta charset=\"utf-8\" />"
            + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />"
            + "<style>body{font-family:monospace;white-space:pre-wrap;font-size:12px;}</style>"
            + "</head><body>"
            + escapeHtml(text)
            + "</body></html>";
    printHtmlInternal(call, name, html);
  }

  private static String escapeHtml(String input) {
    if (input == null) return "";
    return input
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#039;");
  }
}

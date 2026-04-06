package io.ionic.starter;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;

import com.emh.thermalprinter.EscPosPrinter;
import com.emh.thermalprinter.connection.usb.UsbConnection;
import com.emh.thermalprinter.connection.usb.UsbPrintersConnections;
import com.emh.thermalprinter.exceptions.EscPosConnectionException;
import com.emh.thermalprinter.exceptions.EscPosEncodingException;
import com.emh.thermalprinter.exceptions.EscPosParserException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(name = "ThermalPrinter")
public class ThermalPrinterPlugin extends Plugin {
  private static final String ACTION_USB_PERMISSION = "io.ionic.starter.USB_PERMISSION";

  private BroadcastReceiver usbReceiver;

  private PluginCall pendingCall;
  private String pendingText;
  private int pendingDpi;
  private float pendingWidthMm;
  private int pendingCharsPerLine;
  private boolean pendingCut;

  @PluginMethod
  public void debugUsb(PluginCall call) {
    UsbManager usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
    JSObject ret = new JSObject();
    if (usbManager == null) {
      ret.put("devices", new JSObject());
      ret.put("selectedPrinter", null);
      call.resolve(ret);
      return;
    }

    Map<String, UsbDevice> devices = usbManager.getDeviceList();
    JSObject out = new JSObject();
    for (Map.Entry<String, UsbDevice> entry : devices.entrySet()) {
      UsbDevice d = entry.getValue();
      JSObject dev = new JSObject();
      dev.put("vendorId", d.getVendorId());
      dev.put("productId", d.getProductId());
      dev.put("deviceId", d.getDeviceId());
      dev.put("deviceName", d.getDeviceName());
      dev.put("hasPermission", usbManager.hasPermission(d));
      out.put(entry.getKey(), dev);
    }

    UsbConnection usbConnection = UsbPrintersConnections.selectFirstConnected(getContext());
    UsbDevice selected = usbConnection != null ? usbConnection.getDevice() : null;
    if (selected != null) {
      JSObject sel = new JSObject();
      sel.put("vendorId", selected.getVendorId());
      sel.put("productId", selected.getProductId());
      sel.put("deviceId", selected.getDeviceId());
      sel.put("deviceName", selected.getDeviceName());
      sel.put("hasPermission", usbManager.hasPermission(selected));
      ret.put("selectedPrinter", sel);
    } else {
      ret.put("selectedPrinter", null);
    }

    ret.put("devices", out);
    call.resolve(ret);
  }

  @PluginMethod
  public void print(PluginCall call) {
    String text = call.getString("text", "");
    if (text == null || text.trim().isEmpty()) {
      call.reject("Missing text");
      return;
    }

    int dpi = call.getInt("dpi", 203);
    Double widthMmRaw = call.getDouble("widthMm", 48.0);
    float widthMm = widthMmRaw != null ? widthMmRaw.floatValue() : 48.0f;
    int charsPerLine = call.getInt("charsPerLine", 32);
    boolean cut = call.getBoolean("cut", true);

    UsbConnection usbConnection = UsbPrintersConnections.selectFirstConnected(getContext());
    UsbManager usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
    if (usbManager == null || usbConnection == null) {
      call.reject("No USB printer detected (integrated printers often require a vendor SDK).");
      return;
    }

    UsbDevice device = usbConnection.getDevice();
    if (device == null) {
      call.reject("No USB printer device detected.");
      return;
    }

    // If we already have permission, print immediately.
    if (usbManager.hasPermission(device)) {
      doPrint(call, usbManager, device, text, dpi, widthMm, charsPerLine, cut);
      return;
    }

    // Request permission, then print in the receiver.
    this.pendingCall = call;
    this.pendingText = text;
    this.pendingDpi = dpi;
    this.pendingWidthMm = widthMm;
    this.pendingCharsPerLine = charsPerLine;
    this.pendingCut = cut;

    call.setKeepAlive(true);

    if (usbReceiver == null) {
      usbReceiver =
          new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
              if (!ACTION_USB_PERMISSION.equals(intent.getAction())) return;
              UsbDevice usbDevice = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
              boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);

              PluginCall saved = pendingCall;
              pendingCall = null;

              if (saved == null) return;

              if (!granted || usbDevice == null) {
                saved.reject("USB permission denied.");
                return;
              }

              UsbManager mgr = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
              if (mgr == null) {
                saved.reject("USB manager not available.");
                return;
              }

              doPrint(
                  saved,
                  mgr,
                  usbDevice,
                  pendingText,
                  pendingDpi,
                  pendingWidthMm,
                  pendingCharsPerLine,
                  pendingCut);
            }
          };
      getContext().registerReceiver(usbReceiver, new IntentFilter(ACTION_USB_PERMISSION));
    }

    PendingIntent permissionIntent =
        PendingIntent.getBroadcast(
            getContext(),
            0,
            new Intent(ACTION_USB_PERMISSION),
            android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S
                ? PendingIntent.FLAG_MUTABLE
                : 0);
    usbManager.requestPermission(device, permissionIntent);
  }

  private void doPrint(
      PluginCall call,
      UsbManager usbManager,
      UsbDevice usbDevice,
      String text,
      int dpi,
      float widthMm,
      int charsPerLine,
      boolean cut) {
    new Thread(
            () -> {
              try {
                EscPosPrinter printer =
                    new EscPosPrinter(new UsbConnection(usbManager, usbDevice), dpi, widthMm, charsPerLine);
                if (cut) {
                  printer.printFormattedTextAndCut(text);
                } else {
                  printer.printFormattedText(text);
                }
                printer.disconnectPrinter();

                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
              } catch (EscPosConnectionException | EscPosParserException | EscPosEncodingException e) {
                call.reject("Print failed: " + e.getMessage());
              } catch (Exception e) {
                call.reject("Print failed: " + e.getMessage());
              }
            })
        .start();
  }

  @Override
  protected void handleOnDestroy() {
    super.handleOnDestroy();
    if (usbReceiver != null) {
      try {
        getContext().unregisterReceiver(usbReceiver);
      } catch (Exception ignored) {
      }
      usbReceiver = null;
    }
  }
}

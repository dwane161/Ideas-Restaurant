import { Capacitor, registerPlugin } from '@capacitor/core';

type PrintOptions = {
  text: string;
  dpi?: number;
  widthMm?: number;
  charsPerLine?: number;
  cut?: boolean;
};

type PrintResult = { ok: boolean };

const ThermalPrinter = registerPlugin<{ print(options: PrintOptions): Promise<PrintResult> }>(
  'ThermalPrinter',
);

export async function printReceipt(options: PrintOptions): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false;
  await ThermalPrinter.print(options);
  return true;
}

export function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function debugUsb(): Promise<unknown> {
  if (!isAndroidNative()) return null;
  const plugin = registerPlugin<{ debugUsb(): Promise<unknown> }>('ThermalPrinter');
  return plugin.debugUsb();
}

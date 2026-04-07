import { Capacitor, registerPlugin } from '@capacitor/core';

type Diagnostics = {
  device: {
    manufacturer: string;
    brand: string;
    model: string;
    device: string;
    product: string;
    sdkInt: number;
    release: string;
  };
  printerPackages: Array<{ packageName: string }>;
  packagesError?: string;
};

const PrinterDiag = registerPlugin<{ getDiagnostics(): Promise<Diagnostics> }>('PrinterDiag');

export async function getPrinterDiagnostics(): Promise<Diagnostics | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null;
  return PrinterDiag.getDiagnostics();
}


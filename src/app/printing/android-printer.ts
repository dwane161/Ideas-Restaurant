import { Capacitor, registerPlugin } from '@capacitor/core';

const AndroidPrinter = registerPlugin<{
  printHtml(options: { name?: string; html: string }): Promise<{ ok: boolean }>;
  printText(options: { name?: string; text: string }): Promise<{ ok: boolean }>;
}>('AndroidPrinter');

export function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function printHtml(options: { name?: string; html: string }): Promise<boolean> {
  if (!isAndroidNative()) return false;
  try {
    await AndroidPrinter.printHtml(options);
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err ?? '');
    const href = typeof window !== 'undefined' ? String(window.location?.href ?? '') : '';

    if (/not implemented/i.test(raw)) {
      throw new Error(
        `AndroidPrinter no está implementado en la APK instalada.\n\n` +
          `Esto pasa cuando:\n` +
          `- Estás abriendo la app por navegador (PWA) o Live Reload fuera de la APK\n` +
          `- O no reinstalaste la APK después de agregar el plugin nativo.\n\n` +
          `Solución:\n` +
          `1) Desinstala la app del dispositivo\n` +
          `2) En tu PC: "npm run build" y luego "npx cap sync android"\n` +
          `3) Recompila e instala de nuevo (Android Studio Run)\n\n` +
          `Info:\n` +
          `- location: ${href || '(vacío)'}\n`,
      );
    }

    throw err instanceof Error ? err : new Error(raw || 'No se pudo imprimir.');
  }
  return true;
}

export async function printText(options: { name?: string; text: string }): Promise<boolean> {
  if (!isAndroidNative()) return false;
  try {
    await AndroidPrinter.printText(options);
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err ?? '');
    const href = typeof window !== 'undefined' ? String(window.location?.href ?? '') : '';

    if (/not implemented/i.test(raw)) {
      throw new Error(
        `AndroidPrinter no está implementado en la APK instalada.\n\n` +
          `Solución:\n` +
          `1) Desinstala la app del dispositivo\n` +
          `2) En tu PC: "npm run build" y luego "npx cap sync android"\n` +
          `3) Recompila e instala de nuevo (Android Studio Run)\n\n` +
          `Info:\n` +
          `- location: ${href || '(vacío)'}\n`,
      );
    }

    throw err instanceof Error ? err : new Error(raw || 'No se pudo imprimir.');
  }
  return true;
}

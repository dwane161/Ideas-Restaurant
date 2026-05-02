import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';

export type AppUpdateDownloadState = 'idle' | 'downloading' | 'installing' | 'error';

export interface AppUpdateProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  state: AppUpdateDownloadState;
}

const AppUpdater = registerPlugin<{
  canInstallPackages(): Promise<{ allowed: boolean }>;
  openInstallPermissionSettings(): Promise<{ ok: boolean }>;
  downloadAndInstall(options: { url: string; fileName?: string }): Promise<{ ok: boolean; path?: string }>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (progress: AppUpdateProgress) => void,
  ): Promise<PluginListenerHandle>;
}>('AppUpdater');

export function isAndroidNativeApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function canInstallAndroidPackages(): Promise<boolean> {
  if (!isAndroidNativeApp()) return false;
  const result = await AppUpdater.canInstallPackages();
  return Boolean(result.allowed);
}

export async function openAndroidInstallPermissionSettings(): Promise<void> {
  if (!isAndroidNativeApp()) return;
  await AppUpdater.openInstallPermissionSettings();
}

export async function downloadAndInstallAndroidApk(options: { url: string; fileName?: string }): Promise<void> {
  if (!isAndroidNativeApp()) {
    throw new Error('Esta actualización solo está disponible en la app Android.');
  }
  await AppUpdater.downloadAndInstall(options);
}

export async function listenAndroidApkDownloadProgress(
  listener: (progress: AppUpdateProgress) => void,
): Promise<PluginListenerHandle | null> {
  if (!isAndroidNativeApp()) return null;
  return AppUpdater.addListener('downloadProgress', listener);
}

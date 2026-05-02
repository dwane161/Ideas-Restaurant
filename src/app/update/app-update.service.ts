import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '../settings/settings.service';
import { DebugLogService } from '../debug/debug-log.service';
import {
  AppUpdateDownloadState,
  canInstallAndroidPackages,
  downloadAndInstallAndroidApk,
  isAndroidNativeApp,
  listenAndroidApkDownloadProgress,
  openAndroidInstallPermissionSettings,
} from './android-app-updater';

interface AndroidUpdateResponse {
  enabled: boolean;
  updateAvailable: boolean;
  required: boolean;
  latestVersionCode: number;
  latestVersionName: string;
  downloadUrl: string;
  releaseNotes: string;
}

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly update = signal<AndroidUpdateResponse | null>(null);
  private isChecking = false;
  private resumeListenerReady = false;
  private progressListenerReady = false;

  readonly isAndroid = signal(isAndroidNativeApp());
  readonly currentVersionCode = signal(0);
  readonly currentVersionName = signal('');
  readonly downloadState = signal<AppUpdateDownloadState>('idle');
  readonly downloadPercent = signal(0);
  readonly downloadMessage = computed(() => {
    const state = this.downloadState();
    if (state === 'downloading') return `Descargando ${this.downloadPercent()}%`;
    if (state === 'installing') return 'Abrir instalador';
    if (state === 'error') return 'Reintentar actualización';
    return '';
  });
  readonly isDownloading = computed(() => this.downloadState() === 'downloading' || this.downloadState() === 'installing');
  readonly updateAvailable = computed(() => Boolean(this.update()?.enabled && this.update()?.updateAvailable && this.update()?.downloadUrl));
  readonly latestVersionCode = computed(() => this.update()?.latestVersionCode ?? 0);
  readonly latestVersionName = computed(() => this.update()?.latestVersionName ?? '');
  readonly releaseNotes = computed(() => this.update()?.releaseNotes ?? '');
  readonly required = computed(() => Boolean(this.update()?.required));

  constructor(
    private readonly http: HttpClient,
    private readonly settings: SettingsService,
    private readonly debug: DebugLogService,
  ) {}

  start(): void {
    this.installResumeListener();
    this.installProgressListener();
    void this.loadCurrentVersion();
    setTimeout(() => void this.checkForUpdates('startup'), 1500);
  }

  async checkForUpdates(reason: string): Promise<void> {
    if (Capacitor.getPlatform() !== 'android' || this.isChecking) return;
    this.isChecking = true;

    try {
      const { currentVersionCode, currentVersionName } = await this.loadCurrentVersion();
      if (currentVersionCode <= 0) return;

      const update = await firstValueFrom(
        this.http.get<AndroidUpdateResponse>(`${this.settings.apiBaseUrl()}/app-update/android`, {
          params: {
            currentVersionCode: String(currentVersionCode),
            currentVersionName,
          },
        }),
      );

      this.debug.info('Android update check', {
        reason,
        currentVersionCode,
        currentVersionName,
        latestVersionCode: update.latestVersionCode,
        updateAvailable: update.updateAvailable,
        required: update.required,
      });

      this.update.set(update);
    } catch (err) {
      const e = err as { status?: number; message?: string; error?: unknown };
      this.debug.warn('Android update check failed', {
        reason,
        status: e?.status ?? null,
        message: e?.message ?? null,
        error: e?.error ?? null,
      });
    } finally {
      this.isChecking = false;
    }
  }

  private installResumeListener(): void {
    if (this.resumeListenerReady) return;
    this.resumeListenerReady = true;
    if (Capacitor.getPlatform() !== 'android') return;

    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void this.checkForUpdates('resume');
    });
  }

  private async loadCurrentVersion(): Promise<{ currentVersionCode: number; currentVersionName: string }> {
    if (Capacitor.getPlatform() !== 'android') {
      return { currentVersionCode: 0, currentVersionName: '' };
    }

    const info = await App.getInfo();
    const currentVersionCode = toVersionCode(info.build);
    const currentVersionName = info.version ?? '';
    this.currentVersionCode.set(currentVersionCode);
    this.currentVersionName.set(currentVersionName);
    return { currentVersionCode, currentVersionName };
  }

  openAvailableUpdate(): boolean {
    const url = this.update()?.downloadUrl ?? '';
    if (!this.updateAvailable() || !url) return false;
    this.openDownload(url);
    return true;
  }

  async downloadAvailableUpdate(): Promise<{ ok: boolean; message?: string }> {
    const url = this.update()?.downloadUrl ?? '';
    if (!this.updateAvailable() || !url) {
      return { ok: false, message: 'No hay actualización disponible.' };
    }
    if (this.isDownloading()) {
      return { ok: false, message: 'La actualización ya se está descargando.' };
    }

    try {
      const canInstall = await canInstallAndroidPackages();
      if (!canInstall) {
        await openAndroidInstallPermissionSettings();
        return {
          ok: false,
          message: 'Habilite la instalación de apps desconocidas para Ideas Restaurant y vuelva a tocar Actualizar.',
        };
      }

      this.downloadState.set('downloading');
      this.downloadPercent.set(0);
      await downloadAndInstallAndroidApk({
        url,
        fileName: this.buildApkFileName(url),
      });
      this.downloadState.set('installing');
      this.downloadPercent.set(100);
      return { ok: true, message: 'APK descargado. Confirme la instalación en Android.' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? 'No se pudo descargar la actualización.');
      this.downloadState.set('error');
      this.debug.error('Android update download failed', { message });
      return { ok: false, message };
    }
  }

  private openDownload(url: string): void {
    try {
      window.open(url, '_system');
    } catch {
      window.location.href = url;
    }
  }

  private installProgressListener(): void {
    if (this.progressListenerReady) return;
    this.progressListenerReady = true;
    if (!isAndroidNativeApp()) return;

    void listenAndroidApkDownloadProgress((progress) => {
      this.downloadState.set(progress.state);
      const percent = Number(progress.percent ?? 0);
      this.downloadPercent.set(Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.trunc(percent))) : 0);
    });
  }

  private buildApkFileName(url: string): string {
    const latestName = this.latestVersionName();
    const latestCode = this.latestVersionCode();
    try {
      const path = new URL(url).pathname;
      const fromUrl = path.split('/').filter(Boolean).pop();
      if (fromUrl && fromUrl.toLowerCase().endsWith('.apk')) return fromUrl;
    } catch {
    }
    return `ideas-restaurant-${latestName || 'android'}-${latestCode || 'latest'}.apk`;
  }
}

function toVersionCode(value: unknown): number {
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '../settings/settings.service';
import { DebugLogService } from '../debug/debug-log.service';

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

  readonly isAndroid = signal(Capacitor.getPlatform() === 'android');
  readonly currentVersionCode = signal(0);
  readonly currentVersionName = signal('');
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

  private openDownload(url: string): void {
    try {
      window.open(url, '_system');
    } catch {
      window.location.href = url;
    }
  }
}

function toVersionCode(value: unknown): number {
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

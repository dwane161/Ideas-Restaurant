import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AlertController } from '@ionic/angular';
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
  private isChecking = false;
  private isPromptOpen = false;
  private promptedVersionCode = 0;
  private resumeListenerReady = false;

  constructor(
    private readonly http: HttpClient,
    private readonly alertController: AlertController,
    private readonly settings: SettingsService,
    private readonly debug: DebugLogService,
  ) {}

  start(): void {
    this.installResumeListener();
    setTimeout(() => void this.checkForUpdates('startup'), 1500);
  }

  async checkForUpdates(reason: string): Promise<void> {
    if (Capacitor.getPlatform() !== 'android' || this.isChecking) return;
    this.isChecking = true;

    try {
      const info = await App.getInfo();
      const currentVersionCode = toVersionCode(info.build);
      if (currentVersionCode <= 0) return;

      const update = await firstValueFrom(
        this.http.get<AndroidUpdateResponse>(`${this.settings.apiBaseUrl()}/app-update/android`, {
          params: {
            currentVersionCode: String(currentVersionCode),
            currentVersionName: info.version ?? '',
          },
        }),
      );

      this.debug.info('Android update check', {
        reason,
        currentVersionCode,
        currentVersionName: info.version ?? '',
        latestVersionCode: update.latestVersionCode,
        updateAvailable: update.updateAvailable,
        required: update.required,
      });

      if (!update.enabled || !update.updateAvailable || !update.downloadUrl) return;
      if (!update.required && this.promptedVersionCode === update.latestVersionCode) return;

      this.promptedVersionCode = update.latestVersionCode;
      await this.showUpdatePrompt(update);
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

  private async showUpdatePrompt(update: AndroidUpdateResponse): Promise<void> {
    if (this.isPromptOpen) return;
    this.isPromptOpen = true;

    const versionLabel = update.latestVersionName || String(update.latestVersionCode);
    const message = [
      `Hay una nueva versión disponible (${versionLabel}).`,
      update.releaseNotes ? `\n${update.releaseNotes}` : '',
    ].join('');

    const alert = await this.alertController.create({
      header: update.required ? 'Actualización requerida' : 'Actualización disponible',
      message,
      backdropDismiss: !update.required,
      buttons: [
        ...(update.required
          ? []
          : [
              {
                text: 'Luego',
                role: 'cancel',
              },
            ]),
        {
          text: 'Actualizar',
          handler: () => {
            this.openDownload(update.downloadUrl);
            return !update.required;
          },
        },
      ],
    });

    alert.onDidDismiss().then(() => {
      this.isPromptOpen = false;
      if (update.required) setTimeout(() => void this.showUpdatePrompt(update), 3000);
    });

    await alert.present();
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

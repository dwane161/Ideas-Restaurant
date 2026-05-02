import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { AuthService } from '../auth/auth.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '../settings/settings.service';
import { DebugLogService } from '../debug/debug-log.service';
import { isAndroidNative } from '../printing/android-printer';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { AppUpdateService } from '../update/app-update.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [IonicModule],
  standalone: true
})
export class LoginPage implements OnInit {
  ngOnInit(): void {
    if (this.auth.user()) {
      void this.router.navigate(['/tabs/tab1'], { replaceUrl: true });
    }
  }

  maxPin = 4;

  pin = signal<string[]>([]);
  errorMessage = signal<string>('');
  showDiag = signal(false);
  healthState = signal<'idle' | 'loading' | 'ok' | 'error'>('idle');
  healthMessage = signal<string>('');

  dots = Array(this.maxPin);

  keys = [
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },

    { label: '4', value: '4' },
    { label: '5', value: '5' },
    { label: '6', value: '6' },

    { label: '7', value: '7' },
    { label: '8', value: '8' },
    { label: '9', value: '9' },

    { label: '👤', action: 'user' },
    { label: '0', value: '0' },
    { label: '⌫', action: 'delete' },
  ];

  onKeyPress(key: any) {
    if (key.value) {
      this.addDigit(key.value);
    } else if (key.action === 'delete') {
      this.removeDigit();
    } else if (key.action === 'user') {
      this.openDiag();
    }
  }

  constructor(
    private readonly router: Router,
    private readonly toastController: ToastController,
    private readonly auth: AuthService,
    private readonly http: HttpClient,
    private readonly settings: SettingsService,
    readonly appUpdate: AppUpdateService,
    readonly debug: DebugLogService,
  ) {}

  get apiBaseUrl(): string {
    return this.settings.apiBaseUrl();
  }

  get platformLabel(): string {
    if (isAndroidNative()) return 'android';
    return 'web';
  }

  openDiag(): void {
    this.showDiag.set(true);
    this.debug.info('Opened login diagnostics', {
      apiBaseUrl: this.apiBaseUrl,
      platform: this.platformLabel,
      href: safeString(window?.location?.href),
      userAgent: safeString(navigator?.userAgent),
    });
  }

  closeDiag(): void {
    this.showDiag.set(false);
  }

  async testConnection(): Promise<void> {
    const baseUrl = this.apiBaseUrl;
    this.healthState.set('loading');
    this.healthMessage.set('Probando conexión…');
    this.debug.info('Health check start', { endpoint: `${baseUrl}/health` });

    try {
      const endpoint = `${baseUrl}/health`;
      const res =
        Capacitor.getPlatform() === 'web'
          ? await firstValueFrom(this.http.get<{ ok: boolean; time?: string }>(endpoint))
          : await (async () => {
              const r = await CapacitorHttp.get({ url: endpoint, connectTimeout: 10_000, readTimeout: 10_000 });
              const data = typeof r?.data === 'string' ? tryParseJson(r.data) : r.data;
              if (Number(r?.status ?? 0) >= 200 && Number(r?.status ?? 0) < 300) return data as { ok: boolean; time?: string };
              throw { status: r?.status ?? 0, message: `HTTP ${r?.status ?? 0}`, error: data };
            })();
      this.healthState.set('ok');
      this.healthMessage.set(res?.ok ? `OK (${res.time ?? ''})` : 'Respuesta inesperada');
      this.debug.info('Health check success', { response: res ?? null });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string; error?: unknown };
      this.healthState.set('error');
      this.healthMessage.set(`Error (${e?.status ?? 'sin status'})`);
      this.debug.error('Health check failed', {
        status: e?.status ?? null,
        message: e?.message ?? null,
        error: e?.error ?? null,
        endpoint: `${baseUrl}/health`,
      });
    }
  }

  async copyDebugLog(): Promise<void> {
    const text = this.debug.exportText();
    try {
      await navigator.clipboard.writeText(text);
      const toast = await this.toastController.create({
        message: 'Log copiado',
        duration: 1000,
        color: 'success',
        position: 'top',
      });
      await toast.present();
    } catch {
      const toast = await this.toastController.create({
        message: 'No se pudo copiar el log (clipboard no disponible).',
        duration: 1500,
        color: 'medium',
        position: 'top',
      });
      await toast.present();
    }
  }

  async handleUpdateButton(): Promise<void> {
    if (this.appUpdate.updateAvailable()) {
      const result = await this.appUpdate.downloadAvailableUpdate();
      const toast = await this.toastController.create({
        message: result.message ?? (result.ok ? 'Actualización descargada' : 'No se pudo actualizar'),
        duration: result.ok ? 1800 : 2800,
        color: result.ok ? 'success' : 'warning',
        position: 'top',
      });
      await toast.present();
      return;
    }

    await this.appUpdate.checkForUpdates('login-button');
    const toast = await this.toastController.create({
      message: this.appUpdate.updateAvailable() ? 'Actualización disponible' : 'La app está actualizada',
      duration: 1200,
      color: this.appUpdate.updateAvailable() ? 'warning' : 'medium',
      position: 'top',
    });
    await toast.present();
  }

  formatDetails(details: unknown): string {
    try {
      return JSON.stringify(details, null, 2);
    } catch {
      return '[unserializable]';
    }
  }

  addDigit(value: string) {
    if (this.pin().length >= this.maxPin) return;

    const next = [...this.pin(), value];
    this.pin.set(next);
    if (this.errorMessage()) this.errorMessage.set('');
    if (next.length === this.maxPin) {
      setTimeout(() => void this.submit(), 0);
    }
  }

  removeDigit() {
    this.pin.update((p: string[]) => p.slice(0, -1));
    if (this.errorMessage()) this.errorMessage.set('');
  }

  async submit() {
    if (this.pin().length !== this.maxPin) {
      this.errorMessage.set('PIN incompleto');
      const toast = await this.toastController.create({
        message: 'PIN incompleto',
        duration: 1200,
        color: 'medium',
        position: 'top',
      });
      await toast.present();
      return;
    }

    const pinValue = this.pin().join('');
    this.auth.loginWithPin(pinValue).subscribe({
      next: async () => {
        this.pin.set([]);
        this.errorMessage.set('');
        await this.router.navigate(['/tabs/tab1'], { replaceUrl: true });
      },
      error: async (err: unknown) => {
        this.pin.set([]);
        const e = err as { status?: number; error?: unknown };
        const status = e?.status ?? null;

        // Differentiate wrong PIN vs connectivity errors.
        if (status === 401) {
          this.errorMessage.set(extractServerMessage(e.error) ?? 'PIN incorrecto');
        } else if (status === 403 || status === 409 || status === 429) {
          this.errorMessage.set(extractServerMessage(e.error) ?? 'Acceso no disponible');
        } else if (status === 0 || status === null) {
          this.errorMessage.set('Sin conexión al servidor');
        } else {
          this.errorMessage.set('No se pudo iniciar sesión');
        }

        const toast = await this.toastController.create({
          message: this.errorMessage(),
          duration: 1300,
          color: 'danger',
          position: 'top',
        });
        await toast.present();
      },
    });
  }
}

function safeString(value: unknown): string {
  try {
    return String(value ?? '');
  } catch {
    return '';
  }
}

function tryParseJson(value: string): unknown {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function extractServerMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const message = (error as { error?: unknown }).error;
  if (typeof message !== 'string') return null;
  return message.trim() || null;
}

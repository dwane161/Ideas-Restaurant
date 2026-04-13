import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, from, map, tap, throwError } from 'rxjs';
import { SettingsService } from '../settings/settings.service';
import { DebugLogService } from '../debug/debug-log.service';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface AuthUser {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'auth_user_v1';

  readonly user = signal<AuthUser | null>(null);

  constructor(
    private readonly http: HttpClient,
    private readonly settings: SettingsService,
    private readonly debug: DebugLogService,
  ) {
    this.hydrate();
  }

  private hydrate(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AuthUser;
      if (parsed?.id && parsed?.name) {
        this.user.set(parsed);
      }
    } catch {
      // ignore
    }
  }

  private persist(user: AuthUser | null): void {
    if (!user) {
      localStorage.removeItem(this.storageKey);
      return;
    }
    localStorage.setItem(this.storageKey, JSON.stringify(user));
  }

  loginWithPin(pin: string): Observable<{ user: AuthUser }> {
    const apiBaseUrl = this.settings.apiBaseUrl();
    this.debug.info('Login attempt', {
      apiBaseUrl,
      endpoint: `${apiBaseUrl}/auth/login`,
      pinLength: String(pin ?? '').length,
      transport: Capacitor.getPlatform() === 'web' ? 'webview-xhr' : 'native-http',
    });

    const endpoint = `${apiBaseUrl}/auth/login`;

    // On native (Android/iOS), use Capacitor native HTTP to avoid CORS/WebView quirks and get clearer errors.
    const request$ =
      Capacitor.getPlatform() === 'web'
        ? this.http.post<{ user: AuthUser }>(endpoint, { pin })
        : from(
            CapacitorHttp.post({
              url: endpoint,
              headers: { 'Content-Type': 'application/json' },
              data: { pin },
              connectTimeout: 10_000,
              readTimeout: 10_000,
            }),
          ).pipe(
            map((res) => {
              const status = Number(res?.status ?? 0);
              const data = parseMaybeJson(res?.data);
              if (status >= 200 && status < 300) return data as { user: AuthUser };
              throw { status, message: `HTTP ${status}`, error: data } as { status: number; message: string; error: unknown };
            }),
          );

    return request$.pipe(
      tap((res) => {
        if (!res?.user) return;
        this.user.set(res.user);
        this.persist(res.user);
        this.debug.info('Login success', { userId: res.user.id, userName: res.user.name });
      }),
      catchError((err: unknown) => {
        const e = err as { status?: number; message?: string; error?: unknown };
        this.debug.error('Login failed', {
          status: e?.status ?? null,
          message: e?.message ?? null,
          error: e?.error ?? null,
          apiBaseUrl,
        });
        return throwError(() => err);
      }),
    );
  }

  logout(): void {
    this.user.set(null);
    this.persist(null);
  }
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

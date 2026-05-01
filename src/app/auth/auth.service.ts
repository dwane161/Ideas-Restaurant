import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, from, map, tap, throwError } from 'rxjs';
import { SettingsService } from '../settings/settings.service';
import { DebugLogService } from '../debug/debug-log.service';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface AuthUser {
  id: string;
  name: string;
  sessionId: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'auth_user_v1';
  private readonly inactivityTimeoutMs = 10 * 60 * 1000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private activityListenersReady = false;

  readonly user = signal<AuthUser | null>(null);

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly settings: SettingsService,
    private readonly debug: DebugLogService,
  ) {
    this.installActivityListeners();
    this.hydrate();
  }

  private hydrate(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AuthUser;
      if (parsed?.id && parsed?.name && parsed.sessionId) {
        this.user.set(parsed);
        this.startHeartbeat(parsed.sessionId);
        this.resetInactivityTimer();
      } else {
        this.persist(null);
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
        this.startHeartbeat(res.user.sessionId);
        this.resetInactivityTimer();
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
    const sessionId = this.user()?.sessionId ?? null;
    this.stopHeartbeat();
    this.stopInactivityTimer();
    this.user.set(null);
    this.persist(null);
    if (sessionId) {
      this.postAuth('logout', { sessionId }).subscribe({
        error: (err: unknown) => {
          const e = err as { status?: number; message?: string; error?: unknown };
          this.debug.warn('Logout session release failed', {
            status: e?.status ?? null,
            message: e?.message ?? null,
            error: e?.error ?? null,
          });
        },
      });
    }
  }

  private startHeartbeat(sessionId: string): void {
    this.stopHeartbeat();
    this.sendHeartbeat(sessionId);
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(sessionId), 60_000);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private installActivityListeners(): void {
    if (this.activityListenersReady || typeof window === 'undefined') return;
    this.activityListenersReady = true;
    const reset = () => {
      if (!this.user()) return;
      this.resetInactivityTimer();
    };
    for (const eventName of ['click', 'pointerdown', 'touchstart', 'keydown', 'scroll']) {
      window.addEventListener(eventName, reset, { passive: true });
    }
  }

  private resetInactivityTimer(): void {
    this.stopInactivityTimer();
    if (!this.user()) return;
    this.inactivityTimer = setTimeout(() => {
      this.debug.warn('Session closed due to inactivity', { timeoutMinutes: this.inactivityTimeoutMs / 60_000 });
      this.logout();
      void this.router.navigate(['/login'], { replaceUrl: true });
    }, this.inactivityTimeoutMs);
  }

  private stopInactivityTimer(): void {
    if (!this.inactivityTimer) return;
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = null;
  }

  private sendHeartbeat(sessionId: string): void {
    this.postAuth('heartbeat', { sessionId }).subscribe({
      error: (err: unknown) => {
        const e = err as { status?: number; message?: string; error?: unknown };
        this.debug.warn('Auth heartbeat failed', {
          status: e?.status ?? null,
          message: e?.message ?? null,
          error: e?.error ?? null,
        });
        if (e?.status === 401 || e?.status === 403) {
          this.stopHeartbeat();
          this.stopInactivityTimer();
          this.user.set(null);
          this.persist(null);
          void this.router.navigate(['/login'], { replaceUrl: true });
        }
      },
    });
  }

  private postAuth<T = { ok: boolean }>(path: 'heartbeat' | 'logout', data: unknown): Observable<T> {
    const endpoint = `${this.settings.apiBaseUrl()}/auth/${path}`;
    if (Capacitor.getPlatform() === 'web') {
      return this.http.post<T>(endpoint, data);
    }

    return from(
      CapacitorHttp.post({
        url: endpoint,
        headers: { 'Content-Type': 'application/json' },
        data,
        connectTimeout: 10_000,
        readTimeout: 10_000,
      }),
    ).pipe(
      map((res) => {
        const status = Number(res?.status ?? 0);
        const parsed = parseMaybeJson(res?.data);
        if (status >= 200 && status < 300) return parsed as T;
        throw { status, message: `HTTP ${status}`, error: parsed } as { status: number; message: string; error: unknown };
      }),
    );
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

import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { SettingsService } from '../settings/settings.service';

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
    return this.http
      .post<{ user: AuthUser }>(`${this.settings.apiBaseUrl()}/auth/login`, { pin })
      .pipe(
        tap((res) => {
          if (!res?.user) return;
          this.user.set(res.user);
          this.persist(res.user);
        }),
      );
  }

  logout(): void {
    this.user.set(null);
    this.persist(null);
  }
}

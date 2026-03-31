import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';

export interface AppClientRef {
  id: string;
  name: string;
}

export interface AppSettings {
  apiBaseUrl: string;
  defaultClient: AppClientRef | null;
  imagesBaseUrl: string;
  imagesFolder: string;
  backendDbServer: string;
  backendDbDatabase: string;
  backendDbUser: string;
}

interface LocalSettings {
  apiBaseUrl: string;
}

const LOCAL_STORAGE_KEY = 'ideas_restaurant_local_settings_v1';

function normalizeBaseUrl(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return environment.apiBaseUrl;
  return trimmed.replace(/\/+$/, '');
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly local = signal<LocalSettings>(this.loadLocal());
  private readonly remoteDefaultClient = signal<AppClientRef | null>(null);
  private readonly remoteImagesBaseUrl = signal<string>('');
  private readonly remoteImagesFolder = signal<string>('');
  private readonly remoteBackendDbServer = signal<string>('');
  private readonly remoteBackendDbDatabase = signal<string>('');
  private readonly remoteBackendDbUser = signal<string>('');

  readonly isRemoteLoading = signal(false);
  readonly remoteError = signal<string | null>(null);

  readonly settings = computed<AppSettings>(() => ({
    apiBaseUrl: this.local().apiBaseUrl,
    defaultClient: this.remoteDefaultClient(),
    imagesBaseUrl: this.remoteImagesBaseUrl(),
    imagesFolder: this.remoteImagesFolder(),
    backendDbServer: this.remoteBackendDbServer(),
    backendDbDatabase: this.remoteBackendDbDatabase(),
    backendDbUser: this.remoteBackendDbUser(),
  }));

  constructor(private readonly http: HttpClient) {
    // Best effort: load settings from DB at startup.
    void this.refreshRemote();
  }

  apiBaseUrl(): string {
    return this.local().apiBaseUrl;
  }

  setApiBaseUrl(value: string): void {
    const next: LocalSettings = { apiBaseUrl: normalizeBaseUrl(value) };
    this.local.set(next);
    this.persistLocal(next);
    void this.refreshRemote();
  }

  clear(): void {
    const reset = this.defaultsLocal();
    this.local.set(reset);
    this.persistLocal(reset);

    this.remoteDefaultClient.set(null);
    this.remoteImagesBaseUrl.set('');
    this.remoteImagesFolder.set('');
    this.remoteBackendDbServer.set('');
    this.remoteBackendDbDatabase.set('');
    this.remoteBackendDbUser.set('');
  }

  async refreshRemote(): Promise<void> {
    if (this.isRemoteLoading()) return;
    this.isRemoteLoading.set(true);
    this.remoteError.set(null);

    try {
      const res = await firstValueFrom(
        this.http.get<{ items: Array<{ key: string; value: string | null }> }>(
          `${this.apiBaseUrl()}/settings`,
        ),
      );

      const dict = new Map<string, string | null>();
      for (const item of res?.items ?? []) {
        if (item?.key) dict.set(String(item.key), item.value == null ? null : String(item.value));
      }

      const clientId = (dict.get('app.defaultClientId') ?? '').trim();
      const clientName = (dict.get('app.defaultClientName') ?? '').trim();
      this.remoteDefaultClient.set(
        clientId ? { id: clientId, name: clientName || clientId } : null,
      );

      this.remoteImagesBaseUrl.set((dict.get('images.baseUrl') ?? '').trim());
      this.remoteImagesFolder.set((dict.get('images.folder') ?? '').trim());

      this.remoteBackendDbServer.set((dict.get('backend.db.server') ?? '').trim());
      this.remoteBackendDbDatabase.set((dict.get('backend.db.database') ?? '').trim());
      this.remoteBackendDbUser.set((dict.get('backend.db.user') ?? '').trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron cargar settings.';
      this.remoteError.set(message);
    } finally {
      this.isRemoteLoading.set(false);
    }
  }

  async setDefaultClient(value: AppClientRef | null): Promise<void> {
    await firstValueFrom(
      this.http.patch<{ ok: boolean }>(`${this.apiBaseUrl()}/settings`, {
        items: [
          { key: 'app.defaultClientId', value: value?.id ?? null },
          { key: 'app.defaultClientName', value: value?.name ?? null },
        ],
      }),
    );
    this.remoteDefaultClient.set(value);
  }

  async setImagesConfig(value: { baseUrl?: string; folder?: string }): Promise<void> {
    const baseUrl = value.baseUrl != null ? String(value.baseUrl) : undefined;
    const folder = value.folder != null ? String(value.folder) : undefined;

    await firstValueFrom(
      this.http.patch<{ ok: boolean }>(`${this.apiBaseUrl()}/settings`, {
        items: [
          ...(baseUrl !== undefined ? [{ key: 'images.baseUrl', value: baseUrl }] : []),
          ...(folder !== undefined ? [{ key: 'images.folder', value: folder }] : []),
        ],
      }),
    );

    if (baseUrl !== undefined) this.remoteImagesBaseUrl.set(baseUrl.trim());
    if (folder !== undefined) this.remoteImagesFolder.set(folder.trim());
  }

  async setBackendDbConfig(value: { server?: string; database?: string; user?: string }): Promise<void> {
    const server = value.server != null ? String(value.server) : undefined;
    const database = value.database != null ? String(value.database) : undefined;
    const user = value.user != null ? String(value.user) : undefined;

    await firstValueFrom(
      this.http.patch<{ ok: boolean }>(`${this.apiBaseUrl()}/settings`, {
        items: [
          ...(server !== undefined ? [{ key: 'backend.db.server', value: server }] : []),
          ...(database !== undefined ? [{ key: 'backend.db.database', value: database }] : []),
          ...(user !== undefined ? [{ key: 'backend.db.user', value: user }] : []),
        ],
      }),
    );

    if (server !== undefined) this.remoteBackendDbServer.set(server.trim());
    if (database !== undefined) this.remoteBackendDbDatabase.set(database.trim());
    if (user !== undefined) this.remoteBackendDbUser.set(user.trim());
  }

  private defaultsLocal(): LocalSettings {
    return {
      apiBaseUrl: normalizeBaseUrl(environment.apiBaseUrl),
    };
  }

  private loadLocal(): LocalSettings {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return this.defaultsLocal();
      const parsed = JSON.parse(raw) as Partial<LocalSettings>;
      const base = this.defaultsLocal();
      return {
        apiBaseUrl: normalizeBaseUrl(String(parsed.apiBaseUrl ?? base.apiBaseUrl)),
      };
    } catch {
      return this.defaultsLocal();
    }
  }

  private persistLocal(value: LocalSettings): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // ignore
    }
  }
}

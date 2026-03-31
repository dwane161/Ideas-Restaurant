import { Injectable, computed, signal } from '@angular/core';

export type AppNotificationType = 'dish_completed';

export interface AppNotification {
  id: string;
  type: AppNotificationType;
  message: string;
  tableId: number | null;
  createdAt: number; // epoch ms
  readAt: number | null; // epoch ms
}

const STORAGE_KEY = 'ideas_restaurant_notifications_v1';
const MAX_ITEMS = 200;

function uuidLike(): string {
  // Good enough for local storage identifiers.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly itemsSignal = signal<AppNotification[]>(this.load());

  readonly items = this.itemsSignal.asReadonly();
  readonly unreadCount = computed(
    () => this.itemsSignal().filter((n) => n.readAt == null).length,
  );

  add(type: AppNotificationType, message: string, meta?: { tableId?: number | null }): void {
    const now = Date.now();
    const next: AppNotification = {
      id: uuidLike(),
      type,
      message,
      tableId: typeof meta?.tableId === 'number' && Number.isFinite(meta.tableId) ? meta.tableId : null,
      createdAt: now,
      readAt: null,
    };

    this.itemsSignal.update((cur) => {
      const updated = [next, ...cur].slice(0, MAX_ITEMS);
      this.persist(updated);
      return updated;
    });
  }

  markRead(id: string): void {
    const now = Date.now();
    this.itemsSignal.update((cur) => {
      const updated = cur.map((n) => (n.id === id && n.readAt == null ? { ...n, readAt: now } : n));
      this.persist(updated);
      return updated;
    });
  }

  markAllRead(): void {
    const now = Date.now();
    this.itemsSignal.update((cur) => {
      const updated = cur.map((n) => (n.readAt == null ? { ...n, readAt: now } : n));
      this.persist(updated);
      return updated;
    });
  }

  clearAll(): void {
    this.itemsSignal.set([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  private load(): AppNotification[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((p) => {
          const obj = p as Partial<AppNotification>;
          if (!obj.id || !obj.type || !obj.message || !obj.createdAt) return null;
          return {
            id: String(obj.id),
            type: obj.type === 'dish_completed' ? 'dish_completed' : 'dish_completed',
            message: String(obj.message),
            tableId:
              typeof (obj as { tableId?: unknown }).tableId === 'number' &&
              Number.isFinite((obj as { tableId?: number }).tableId)
                ? Number((obj as { tableId?: number }).tableId)
                : null,
            createdAt: Number(obj.createdAt),
            readAt: obj.readAt == null ? null : Number(obj.readAt),
          } satisfies AppNotification;
        })
        .filter((x): x is AppNotification => Boolean(x))
        .slice(0, MAX_ITEMS);
    } catch {
      return [];
    }
  }

  private persist(value: AppNotification[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // ignore
    }
  }
}

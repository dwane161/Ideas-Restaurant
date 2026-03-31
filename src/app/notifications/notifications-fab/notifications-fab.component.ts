import { Component, computed, signal } from '@angular/core';
import { NotificationsService, type AppNotification } from '../notifications.service';

@Component({
  selector: 'app-notifications-fab',
  templateUrl: './notifications-fab.component.html',
  styleUrls: ['./notifications-fab.component.scss'],
  standalone: false,
})
export class NotificationsFabComponent {
  readonly notifications = this.notificationsService.items;
  readonly unreadCount = this.notificationsService.unreadCount;

  readonly isOpen = signal(false);
  readonly grouped = computed(() => {
    const items = this.notifications();
    const groups = new Map<string, { tableId: number | null; title: string; unread: number; items: AppNotification[] }>();

    const formatMesa = (id: number) => `Mesa ${String(id).padStart(2, '0')}`;

    for (const n of items) {
      const tableId = typeof n.tableId === 'number' && Number.isFinite(n.tableId) ? n.tableId : null;
      const title = tableId == null ? 'General' : formatMesa(tableId);
      const key = tableId == null ? 'general' : `table:${tableId}`;

      const g = groups.get(key) ?? { tableId, title, unread: 0, items: [] as AppNotification[] };
      g.items.push(n);
      if (!n.readAt) g.unread += 1;
      groups.set(key, g);
    }

    return Array.from(groups.values()).sort((a, b) => {
      const aLatest = a.items[0]?.createdAt ?? 0;
      const bLatest = b.items[0]?.createdAt ?? 0;
      if (bLatest !== aLatest) return bLatest - aLatest;
      if (a.tableId == null && b.tableId != null) return 1;
      if (a.tableId != null && b.tableId == null) return -1;
      return (a.tableId ?? 0) - (b.tableId ?? 0);
    });
  });

  constructor(private readonly notificationsService: NotificationsService) {}

  open(): void {
    this.isOpen.set(true);
    this.notificationsService.markAllRead();
  }

  close(): void {
    this.isOpen.set(false);
  }

  clear(): void {
    this.notificationsService.clearAll();
  }

  markRead(n: AppNotification): void {
    this.notificationsService.markRead(n.id);
  }
}

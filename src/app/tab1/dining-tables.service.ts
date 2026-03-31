import { Injectable, computed, signal } from '@angular/core';
import { OrdersApiService } from '../api/orders-api.service';
import { AuthService } from '../auth/auth.service';
import { SettingsService, type AppClientRef } from '../settings/settings.service';
import { NotifyService } from '../notifications/notify.service';
import { TablesApiService } from '../api/tables-api.service';

export type TableStatus = 'available' | 'occupied' | 'pending' | 'cleaning';

export interface DiningTable {
  id: number;
  seats: number;
  status: TableStatus;
  elapsed?: string;
  total?: number;
  selected?: boolean;
}

export interface OrderItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  statusCode?: string;
  statusLabel?: string;
  statusColor?: string | null;
}

export interface AccountOrder {
  id: string;
  name: string;
  items: OrderItem[];
}

export interface TableOrder {
  tableId: number;
  accounts: AccountOrder[];
  remoteOrderId?: string;
  createdAtMs?: number;
}

export interface TableClientInfo {
  client: AppClientRef | null;
  beneficiary: string;
}

export type PaymentMethod = 'percentage' | 'amounts';

export interface PaymentSplit {
  accountId: string;
  accountName: string;
  amount: number;
  percent?: number;
}

export interface TableInvoice {
  id: string;
  tableId: number;
  createdAtIso: string;
  order: TableOrder;
  total: number;
  method: PaymentMethod;
  splits: PaymentSplit[];
}

type BillingMode = 'single' | 'shared';

@Injectable({ providedIn: 'root' })
export class DiningTablesService {
  readonly selectedTableId = signal<number | null>(null);
  readonly isOrdersLoading = signal(false);
  readonly hasOrdersLoaded = signal(false);
  readonly isTablesLoading = signal(false);
  readonly hasTablesLoaded = signal(false);

  readonly tables = signal<DiningTable[]>([]);

  private readonly ordersByTableId = signal<Record<number, TableOrder>>({});

  private readonly invoicesByTableId = signal<Record<number, TableInvoice>>({});

  private readonly clientsByTableId = signal<Record<number, TableClientInfo>>({});

  private readonly lastItemStatusByKey = new Map<string, string>();
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ordersApi: OrdersApiService,
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
    private readonly notify: NotifyService,
    private readonly tablesApi: TablesApiService,
  ) {
    this.startElapsedTicker();
  }

  private startElapsedTicker(): void {
    if (this.elapsedTimer) return;
    this.elapsedTimer = setInterval(() => {
      this.updateElapsedForTables();
    }, 15_000);
  }

  private updateElapsedForTables(): void {
    const ordersByTable = this.ordersByTableId();
    const now = Date.now();

    this.tables.update((tables) =>
      tables.map((t) => {
        if (t.status === 'available') return t;
        const order = ordersByTable[t.id];
        const createdAt = order?.createdAtMs;
        if (!createdAt) return t;
        const elapsed = this.formatElapsed(now - createdAt);
        return elapsed === t.elapsed ? t : { ...t, elapsed };
      }),
    );
  }

  private parseIsoToMs(value: unknown): number | undefined {
    const raw = typeof value === 'string' ? value : '';
    if (!raw) return undefined;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : undefined;
  }

  private formatElapsed(diffMs: number): string {
    const mins = Math.max(0, Math.floor(diffMs / 60_000));
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;

    if (hours <= 0) return `${mins}M`;
    if (rem === 0) return `${hours}H`;
    return `${hours}H ${String(rem).padStart(2, '0')}M`;
  }

  refreshOrdersFromBackend(onDone?: () => void): void {
    if (!this.hasTablesLoaded() && !this.isTablesLoading()) {
      this.loadTablesFromBackend(() => this.refreshOrdersFromBackend(onDone));
      return;
    }

    this.isOrdersLoading.set(true);
    this.ordersApi.listOrders('open,paid,cleaning').subscribe({
      next: (res) => {
        const orders = res?.orders ?? [];

        const newlyCompleted = this.detectNewlyCompletedItems(orders);

        const nextOrders: Record<number, TableOrder> = {};
        const nextClients: Record<number, TableClientInfo> = {};
        for (const order of orders) {
          const createdAtMs = this.parseIsoToMs(order.createdAtIso) ?? Date.now();
          nextOrders[order.tableId] = {
            tableId: order.tableId,
            remoteOrderId: order.id,
            createdAtMs,
            accounts: order.accounts.map((a) => ({
              id: a.key,
              name: a.name,
              items: a.items.map((i) => ({
                id: i.id,
                name: i.name,
                qty: i.qty,
                unitPrice: i.unitPrice,
                statusCode: i.statusCode ?? i.status ?? undefined,
                statusLabel: i.statusLabel ?? i.statusCode ?? i.status ?? undefined,
                statusColor: i.statusColor ?? null,
              })),
            })),
          };

          // Persist explicit nulls so clearing client doesn't fall back to defaults after refresh.
          nextClients[order.tableId] = {
            client: order.clientId
              ? {
                  id: String(order.clientId),
                  name: String(order.clientName ?? order.clientId),
                }
              : null,
            beneficiary: String(order.beneficiary ?? ''),
          };
        }

        this.ordersByTableId.set(nextOrders);
        this.clientsByTableId.set(nextClients);

        this.tables.update((tables) =>
          tables.map((t) => {
            const order = nextOrders[t.id];
            if (!order) {
              return { ...t, status: 'available', total: undefined, elapsed: undefined };
            }
            const total = this.computeOrderTotal(order);
            const elapsed = order.createdAtMs ? this.formatElapsed(Date.now() - order.createdAtMs) : undefined;
            const remote = orders.find((o) => o.tableId === t.id);
            const statusFromCatalog = (remote?.tableStatus ?? '').trim().toLowerCase();
            const status =
              statusFromCatalog === 'available' ||
              statusFromCatalog === 'occupied' ||
              statusFromCatalog === 'pending' ||
              statusFromCatalog === 'cleaning'
                ? (statusFromCatalog as TableStatus)
                : remote?.status === 'paid'
                  ? 'pending'
                  : remote?.status === 'cleaning'
                    ? 'cleaning'
                    : 'occupied';
            return { ...t, status, total, elapsed };
          }),
        );

        this.hasOrdersLoaded.set(true);
        this.isOrdersLoading.set(false);
        onDone?.();

        if (newlyCompleted.length > 0) {
          void this.emitCompletedNotifications(newlyCompleted);
        }
      },
      error: () => {
        this.hasOrdersLoaded.set(true);
        this.isOrdersLoading.set(false);
        onDone?.();
      },
    });
  }

  loadTablesFromBackend(onDone?: () => void): void {
    if (this.isTablesLoading()) return;
    this.isTablesLoading.set(true);

    this.tablesApi.listTables(true).subscribe({
      next: (res) => {
        const rows = (res?.tables ?? [])
          .filter((t) => t && typeof t.id === 'number' && Number.isFinite(t.id))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);

        const next: DiningTable[] = rows.map((t) => ({
          id: Number(t.id),
          seats: Number(t.seats ?? 4) || 4,
          status: 'available',
        }));

        this.tables.set(next);
        this.hasTablesLoaded.set(true);
        this.isTablesLoading.set(false);

        if (this.selectedTableId() == null && next.length > 0) {
          this.selectTable(next[0].id);
        }

        onDone?.();
      },
      error: () => {
        // Keep whatever we already have; avoid blocking the app if tables endpoint fails.
        this.hasTablesLoaded.set(this.tables().length > 0);
        this.isTablesLoading.set(false);
        onDone?.();
      },
    });
  }

  private detectNewlyCompletedItems(
    orders: Array<{
      id: string;
      tableId: number;
      accounts: Array<{ key: string; items: Array<{ id: string; name: string; qty: number; statusCode?: string; status?: string }> }>;
    }>,
  ): Array<{ tableId: number; name: string }> {
    const hasSnapshot = this.lastItemStatusByKey.size > 0;
    const nextStatusByKey = new Map<string, string>();
    const newlyCompleted: Array<{ tableId: number; name: string }> = [];

    for (const order of orders) {
      for (const account of order.accounts ?? []) {
        for (const item of account.items ?? []) {
          const itemId = String(item.id ?? '').trim();
          if (!itemId) continue;
          const qty = Number(item.qty ?? 0);
          const status = String(item.statusCode ?? item.status ?? '').trim().toLowerCase();
          const key = `${order.id}:${account.key}:${itemId}`;
          nextStatusByKey.set(key, status);

          if (qty <= 0) continue;
          if (status !== 'completed') continue;
          if (!hasSnapshot) continue; // don't notify on first load

          const prev = String(this.lastItemStatusByKey.get(key) ?? '').trim().toLowerCase();
          if (prev !== 'completed') {
            newlyCompleted.push({ tableId: order.tableId, name: String(item.name ?? itemId) });
          }
        }
      }
    }

    this.lastItemStatusByKey.clear();
    for (const [k, v] of nextStatusByKey) this.lastItemStatusByKey.set(k, v);

    return newlyCompleted;
  }

  private async emitCompletedNotifications(items: Array<{ tableId: number; name: string }>): Promise<void> {
    if (items.length === 0) return;

    const formatMesa = (id: number) => `Mesa ${String(id).padStart(2, '0')}`;

    if (items.length === 1) {
      await this.notify.dishCompleted({
        message: `${items[0].name} listo • ${formatMesa(items[0].tableId)}`,
        tableId: items[0].tableId,
      });
      return;
    }

    const byTable = new Map<number, number>();
    for (const it of items) byTable.set(it.tableId, (byTable.get(it.tableId) ?? 0) + 1);

    if (byTable.size === 1) {
      const tableId = Array.from(byTable.keys())[0];
      const count = byTable.get(tableId) ?? items.length;
      await this.notify.dishCompleted({
        message: `${count} plato(s) listo(s) • ${formatMesa(tableId)}`,
        tableId,
      });
      return;
    }

    const tables = Array.from(byTable.keys())
      .sort((a, b) => a - b)
      .slice(0, 3)
      .map(formatMesa)
      .join(', ');
    const more = byTable.size > 3 ? ` +${byTable.size - 3}` : '';
    await this.notify.dishCompleted({
      message: `${items.length} plato(s) listo(s) • ${tables}${more}`,
      tableId: null,
    });
  }

  readonly occupiedCount = computed(
    () => this.tables().filter((t) => t.status === 'occupied').length,
  );

  readonly totalCount = computed(() => this.tables().length);

  readonly availableCount = computed(
    () => this.tables().filter((t) => t.status === 'available').length,
  );

  readonly occupiedTables = computed(() =>
    this.tables().filter((t) => t.status === 'occupied'),
  );

  readonly selectedTable = computed(() => {
    const id = this.selectedTableId();
    return typeof id === 'number' ? this.getTable(id) : undefined;
  });

  readonly selectedOrder = computed(() => {
    const id = this.selectedTableId();
    return typeof id === 'number' ? this.getOrder(id) : undefined;
  });

  selectTable(tableId: number): void {
    this.selectedTableId.set(tableId);
    this.tables.update((tables) =>
      tables.map((t) => ({
        ...t,
        selected: t.id === tableId,
      })),
    );

    this.hydrateOrderFromBackend(tableId);
    this.applyDefaultClientIfMissing(tableId);
  }

  getTable(tableId: number): DiningTable | undefined {
    return this.tables().find((t) => t.id === tableId);
  }

  getOrder(tableId: number): TableOrder | undefined {
    return this.ordersByTableId()[tableId];
  }

  getInvoice(tableId: number): TableInvoice | undefined {
    return this.invoicesByTableId()[tableId];
  }

  getClientInfo(tableId: number): TableClientInfo {
    return (
      this.clientsByTableId()[tableId] ?? {
        client: this.settings.settings().defaultClient,
        beneficiary: '',
      }
    );
  }

  setClientInfo(tableId: number, info: TableClientInfo): void {
    this.clientsByTableId.update((cur) => ({ ...cur, [tableId]: info }));

    const remoteOrderId = this.ordersByTableId()[tableId]?.remoteOrderId;
    if (!remoteOrderId) return;

    this.ordersApi
      .setOrderClient(remoteOrderId, {
        clientId: info.client?.id ?? null,
        clientName: info.client?.name ?? null,
        beneficiary: info.beneficiary || null,
      })
      .subscribe({ error: () => {} });
  }

  clearClientInfo(tableId: number): void {
    // Keep an explicit entry so we don't fall back to default client again.
    this.clientsByTableId.update((cur) => ({ ...cur, [tableId]: { client: null, beneficiary: '' } }));

    const remoteOrderId = this.ordersByTableId()[tableId]?.remoteOrderId;
    if (!remoteOrderId) return;
    this.ordersApi
      .setOrderClient(remoteOrderId, { clientId: null, clientName: null, beneficiary: null })
      .subscribe({ error: () => {} });
  }

  private accountIdForIndex(index: number): string {
    const base = 65; // 'A'
    return index < 26 ? String.fromCharCode(base + index) : `A${index + 1}`;
  }

  openTable(tableId: number, billingMode: BillingMode, accountNames?: string[]): void {
    this.tables.update((tables) =>
      tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              status: 'occupied',
              elapsed: '0M',
              total: undefined,
            }
          : t,
      ),
    );

    const existing = this.ordersByTableId()[tableId];
    if (existing) return;

    const normalizedNames =
      billingMode === 'shared'
        ? (accountNames ?? []).map((n) => (typeof n === 'string' ? n.trim() : ''))
        : [];

    const sharedCount = Math.max(2, normalizedNames.length || 2);

    const accounts: AccountOrder[] =
      billingMode === 'shared'
        ? Array.from({ length: sharedCount }, (_, index) => ({
            id: this.accountIdForIndex(index),
            name: normalizedNames[index] || `Cuenta ${index + 1}`,
            items: [],
          }))
        : [{ id: 'A', name: 'Cuenta única', items: [] }];

    this.ordersByTableId.update((current) => ({
      ...current,
      [tableId]: {
        tableId,
        accounts,
        createdAtMs: Date.now(),
      },
    }));

    this.applyDefaultClientIfMissing(tableId);

    const clientInfo = this.getClientInfo(tableId);

    this.ordersApi
      .openOrder({
        tableId,
        billingMode,
        accountNames: billingMode === 'shared' ? normalizedNames : undefined,
        createdByUserId: this.auth.user()?.id ?? undefined,
        clientId: clientInfo.client?.id ?? undefined,
        clientName: clientInfo.client?.name ?? undefined,
        beneficiary: clientInfo.beneficiary || undefined,
      })
      .subscribe({
        next: (res) => {
          const remoteOrderId = res?.order?.id;
          if (!remoteOrderId) return;
          this.ordersByTableId.update((cur) => {
            const order = cur[tableId];
            if (!order) return cur;
            return {
              ...cur,
              [tableId]: { ...order, remoteOrderId },
            };
          });

          // Ensure client selection is persisted even if user changed it before remoteOrderId existed.
          const clientInfo = this.getClientInfo(tableId);
          this.ordersApi
            .setOrderClient(remoteOrderId, {
              clientId: clientInfo.client?.id ?? null,
              clientName: clientInfo.client?.name ?? null,
              beneficiary: clientInfo.beneficiary || null,
            })
            .subscribe({ error: () => {} });
        },
        error: () => {},
      });
  }

  addItemToOrder(
    tableId: number,
    accountId: string,
    item: Omit<OrderItem, 'qty'>,
    qtyDelta = 1,
  ): void {
    this.ordersByTableId.update((current) => {
      const existing = current[tableId] ?? {
        tableId,
        accounts: [{ id: 'A', name: 'Cuenta única', items: [] }],
      };

      const accounts = existing.accounts.map((account) => {
        if (account.id !== accountId) return account;

        const existingItem = account.items.find((i) => i.id === item.id);
        if (!existingItem) {
          return {
            ...account,
            items: [
              ...account.items,
              {
                ...item,
                qty: Math.max(1, qtyDelta),
                statusCode: 'pending',
                statusLabel: 'PENDIENTE',
                statusColor: null,
              },
            ],
          };
        }

        const nextQty = existingItem.qty + qtyDelta;
        return {
          ...account,
          items: account.items
            .map((i) => (i.id === item.id ? { ...i, qty: Math.max(0, nextQty) } : i))
            .filter((i) => i.qty > 0),
        };
      });

      return {
        ...current,
        [tableId]: {
          ...existing,
          accounts,
        },
      };
    });

    const remoteOrderId = this.ordersByTableId()[tableId]?.remoteOrderId;
    if (!remoteOrderId) return;

    this.ordersApi
      .addItem(remoteOrderId, {
        accountKey: accountId,
        productId: item.id,
        productName: item.name,
        unitPrice: item.unitPrice,
        qtyDelta,
      })
      .subscribe({ error: () => {} });
  }

  private computeOrderTotal(order: TableOrder): number {
    return order.accounts.reduce(
      (sum, a) => sum + a.items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
      0,
    );
  }

  payOrder(tableId: number, method: PaymentMethod, splits: PaymentSplit[]): TableInvoice | undefined {
    const order = this.getOrder(tableId);
    if (!order) return undefined;

    const total = this.computeOrderTotal(order);
    const invoice: TableInvoice = {
      id: `${tableId}-${Date.now()}`,
      tableId,
      createdAtIso: new Date().toISOString(),
      order,
      total,
      method,
      splits,
    };

    this.invoicesByTableId.update((current) => ({
      ...current,
      [tableId]: invoice,
    }));

    this.tables.update((tables) =>
      tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              status: 'pending',
              total,
            }
          : t,
      ),
    );

    const remoteOrderId = this.ordersByTableId()[tableId]?.remoteOrderId;
    if (remoteOrderId) {
      this.ordersApi
        .pay(remoteOrderId, {
          method,
          splits: splits.map((s) => ({
            accountKey: s.accountId,
            amount: s.amount,
            percent: s.percent,
          })),
        })
        .subscribe({ error: () => {} });
    }

    return invoice;
  }

  startCleaning(tableId: number): void {
    this.tables.update((tables) =>
      tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              status: 'cleaning',
            }
          : t,
      ),
    );

    const remoteOrderId = this.ordersByTableId()[tableId]?.remoteOrderId;
    if (remoteOrderId) {
      this.ordersApi.setOrderStatus(remoteOrderId, 'cleaning').subscribe({ error: () => {} });
    }
  }

  setAvailable(tableId: number): void {
    const remoteOrderId = this.ordersByTableId()[tableId]?.remoteOrderId;

    this.tables.update((tables) =>
      tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              status: 'available',
              elapsed: undefined,
              total: undefined,
            }
          : t,
      ),
    );

    this.ordersByTableId.update((current) => {
      if (!current[tableId]) return current;
      const { [tableId]: _removed, ...rest } = current;
      return rest;
    });

    this.invoicesByTableId.update((current) => {
      if (!current[tableId]) return current;
      const { [tableId]: _removed, ...rest } = current;
      return rest;
    });

    // Fully remove explicit entry when table is reset.
    this.clientsByTableId.update((cur) => {
      if (!cur[tableId]) return cur;
      const { [tableId]: _removed, ...rest } = cur;
      return rest;
    });

    if (remoteOrderId) {
      this.ordersApi.setOrderStatus(remoteOrderId, 'closed').subscribe({ error: () => {} });
    }
  }

  private applyDefaultClientIfMissing(tableId: number): void {
    const existing = this.clientsByTableId()[tableId];
    // If we already have an explicit entry (even null), don't override it.
    if (existing) return;
    const defaults = this.settings.settings();
    if (!defaults.defaultClient) return;
    this.setClientInfo(tableId, {
      client: defaults.defaultClient,
      beneficiary: '',
    });
  }

  private hydrateOrderFromBackend(tableId: number): void {
    const existing = this.ordersByTableId()[tableId];
    if (existing?.remoteOrderId) return;

    this.ordersApi.getOrderByTable(tableId, 'open,paid,cleaning').subscribe({
      next: (res) => {
        const remote = res?.order;
        if (!remote) return;
        const createdAtMs = this.parseIsoToMs(remote.createdAtIso) ?? Date.now();

        this.ordersByTableId.update((cur) => ({
          ...cur,
          [tableId]: {
            tableId,
            remoteOrderId: remote.id,
            createdAtMs,
            accounts: remote.accounts.map((a) => ({
              id: a.key,
              name: a.name,
              items: a.items.map((i) => ({
                id: i.id,
                name: i.name,
                qty: i.qty,
                unitPrice: i.unitPrice,
                statusCode: i.statusCode ?? i.status ?? undefined,
                statusLabel: i.statusLabel ?? i.statusCode ?? i.status ?? undefined,
                statusColor: i.statusColor ?? null,
              })),
            })),
          },
        }));

        this.setClientInfo(tableId, {
          client: remote.clientId
            ? { id: String(remote.clientId), name: String(remote.clientName ?? remote.clientId) }
            : null,
          beneficiary: String(remote.beneficiary ?? ''),
        });

        this.tables.update((tables) =>
          tables.map((t) =>
            t.id === tableId
              ? {
                  ...t,
                  status: remote.status === 'paid' ? 'pending' : remote.status === 'cleaning' ? 'cleaning' : 'occupied',
                }
              : t,
          ),
        );
      },
      error: () => {},
    });
  }
}

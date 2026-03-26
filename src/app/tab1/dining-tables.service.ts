import { Injectable, computed, signal } from '@angular/core';
import { OrdersApiService } from '../api/orders-api.service';
import { AuthService } from '../auth/auth.service';

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
  status?: string;
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

  readonly tables = signal<DiningTable[]>([
    { id: 1, seats: 4, status: 'available' },
    { id: 2, seats: 4, status: 'available' },
    { id: 3, seats: 6, status: 'available' },
    { id: 4, seats: 8, status: 'available' },
    { id: 5, seats: 4, status: 'available' },
    { id: 6, seats: 2, status: 'available', selected: true },
    { id: 7, seats: 4, status: 'available' },
    { id: 8, seats: 4, status: 'available' },
    { id: 9, seats: 4, status: 'available' },
    { id: 10, seats: 2, status: 'available' },
    { id: 11, seats: 4, status: 'available' },
    { id: 12, seats: 4, status: 'available' },
  ]);

  private readonly ordersByTableId = signal<Record<number, TableOrder>>({});

  private readonly invoicesByTableId = signal<Record<number, TableInvoice>>({});

  constructor(
    private readonly ordersApi: OrdersApiService,
    private readonly auth: AuthService,
  ) {}

  refreshOrdersFromBackend(onDone?: () => void): void {
    this.isOrdersLoading.set(true);
    this.ordersApi.listOrders('open,paid,cleaning').subscribe({
      next: (res) => {
        const orders = res?.orders ?? [];

        const nextOrders: Record<number, TableOrder> = {};
        for (const order of orders) {
          nextOrders[order.tableId] = {
            tableId: order.tableId,
            remoteOrderId: order.id,
            accounts: order.accounts.map((a) => ({
              id: a.key,
              name: a.name,
              items: a.items.map((i) => ({
                id: i.id,
                name: i.name,
                qty: i.qty,
                unitPrice: i.unitPrice,
                status: i.status,
              })),
            })),
          };
        }

        this.ordersByTableId.set(nextOrders);

        this.tables.update((tables) =>
          tables.map((t) => {
            const order = nextOrders[t.id];
            if (!order) {
              return { ...t, status: 'available', total: undefined, elapsed: undefined };
            }
            const total = this.computeOrderTotal(order);
            const remoteStatus = orders.find((o) => o.tableId === t.id)?.status;
            const status =
              remoteStatus === 'paid'
                ? 'pending'
                : remoteStatus === 'cleaning'
                  ? 'cleaning'
                  : 'occupied';
            return { ...t, status, total };
          }),
        );

        this.hasOrdersLoaded.set(true);
        this.isOrdersLoading.set(false);
        onDone?.();
      },
      error: () => {
        this.hasOrdersLoaded.set(true);
        this.isOrdersLoading.set(false);
        onDone?.();
      },
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
      },
    }));

    this.ordersApi
      .openOrder({
        tableId,
        billingMode,
        accountNames: billingMode === 'shared' ? normalizedNames : undefined,
        createdByUserId: this.auth.user()?.id ?? undefined,
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
            items: [...account.items, { ...item, qty: Math.max(1, qtyDelta), status: 'pending' }],
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

    if (remoteOrderId) {
      this.ordersApi.setOrderStatus(remoteOrderId, 'closed').subscribe({ error: () => {} });
    }
  }

  private hydrateOrderFromBackend(tableId: number): void {
    const existing = this.ordersByTableId()[tableId];
    if (existing?.remoteOrderId) return;

    this.ordersApi.getOrderByTable(tableId, 'open,paid,cleaning').subscribe({
      next: (res) => {
        const remote = res?.order;
        if (!remote) return;

        this.ordersByTableId.update((cur) => ({
          ...cur,
          [tableId]: {
            tableId,
            remoteOrderId: remote.id,
            accounts: remote.accounts.map((a) => ({
              id: a.key,
              name: a.name,
              items: a.items.map((i) => ({
                id: i.id,
                name: i.name,
                qty: i.qty,
                unitPrice: i.unitPrice,
                status: i.status,
              })),
            })),
          },
        }));

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

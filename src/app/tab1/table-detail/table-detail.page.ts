import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import {
  DiningTablesService,
  type DiningTable,
  type PaymentSplit,
  type TableInvoice,
  type TableOrder,
} from '../dining-tables.service';

type BillingMode = 'single' | 'shared';

@Component({
  selector: 'app-table-detail',
  templateUrl: './table-detail.page.html',
  styleUrls: ['./table-detail.page.scss'],
  standalone: false,
})
export class TableDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly tablesService = inject(DiningTablesService);

  private readonly tableId = Number(this.route.snapshot.paramMap.get('id'));

  readonly billingMode = signal<BillingMode>('single');
  readonly peopleCount = signal<number>(2);
  readonly accountNames = signal<string[]>(['', '']);

  readonly table = computed<DiningTable | undefined>(() =>
    this.tablesService.getTable(this.tableId),
  );

  readonly order = computed<TableOrder | undefined>(() =>
    this.tablesService.getOrder(this.tableId),
  );

  readonly invoice = computed<TableInvoice | undefined>(() =>
    this.tablesService.getInvoice(this.tableId),
  );

  get tableLabel(): string {
    return `Mesa ${String(this.tableId).padStart(2, '0')}`;
  }

  goBack(): void {
    this.router.navigate(['/tabs/tab1']);
  }

  openTable(): void {
    const mode = this.billingMode();
    if (mode === 'shared') {
      const count = this.clampPeopleCount(this.peopleCount());
      const names = this.normalizeAccountNames(this.accountNames(), count);
      this.tablesService.openTable(this.tableId, 'shared', names);
      return;
    }

    this.tablesService.openTable(this.tableId, 'single');
  }

  async cobrar(): Promise<void> {
    const order = this.tablesService.getOrder(this.tableId);
    if (!order) return;

    if (!this.canCobrar(order)) {
      const message = this.orderHasItems(order)
        ? 'Solo se puede cobrar cuando todos los items estén en estado COMPLETED.'
        : 'Agrega al menos un plato antes de cobrar.';
      const alert = await this.alertController.create({
        header: 'No se puede cobrar',
        message,
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    const total = this.orderTotal(order);

    const confirm = await this.alertController.create({
      header: 'Confirmar cobro',
      message: `Total: $${total.toFixed(2)}`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cobrar', role: 'confirm' },
      ],
    });
    await confirm.present();
    const result = await confirm.onDidDismiss();
    if (result.role !== 'confirm') return;

    if (order.accounts.length > 1) {
      this.router.navigate([`/tabs/tab1/mesa/${this.tableId}/pago`]);
      return;
    }

    const a = order.accounts[0];
    const splits: PaymentSplit[] = [
      { accountId: a.id, accountName: a.name, amount: total },
    ];

    const invoice = this.tablesService.payOrder(this.tableId, 'amounts', splits);
    if (!invoice) return;

    this.router.navigate([`/tabs/tab1/mesa/${this.tableId}/factura`]);
  }

  irAMenu(): void {
    this.tablesService.selectTable(this.tableId);
    this.router.navigate(['/tabs/tab2']);
  }

  verFactura(): void {
    this.router.navigate([`/tabs/tab1/mesa/${this.tableId}/factura`]);
  }

  pasarALimpiando(): void {
    this.tablesService.startCleaning(this.tableId);
  }

  marcarDisponible(): void {
    this.tablesService.setAvailable(this.tableId);
    this.router.navigate(['/tabs/tab1']);
  }

  setBillingMode(value: unknown): void {
    const mode: BillingMode = value === 'shared' ? 'shared' : 'single';
    this.billingMode.set(mode);
    if (mode === 'shared') {
      const count = this.clampPeopleCount(this.peopleCount());
      this.peopleCount.set(count);
      this.accountNames.set(this.normalizeAccountNames(this.accountNames(), count));
    }
  }

  incrementPeople(): void {
    const next = this.clampPeopleCount(this.peopleCount() + 1);
    this.peopleCount.set(next);
    this.accountNames.set(this.normalizeAccountNames(this.accountNames(), next));
  }

  decrementPeople(): void {
    const next = this.clampPeopleCount(this.peopleCount() - 1);
    this.peopleCount.set(next);
    this.accountNames.set(this.normalizeAccountNames(this.accountNames(), next));
  }

  setAccountName(index: number, value: unknown): void {
    const current = this.accountNames();
    const next = [...current];
    next[index] = typeof value === 'string' ? value : String(value ?? '');
    this.accountNames.set(next);
  }

  trackByIndex(index: number): number {
    return index;
  }

  private clampPeopleCount(value: number): number {
    const safe = Number.isFinite(value) ? Math.trunc(value) : 2;
    return Math.min(12, Math.max(2, safe));
  }

  private normalizeAccountNames(names: string[], count: number): string[] {
    const next = Array.from({ length: count }, (_, index) => {
      const existing = names[index];
      const trimmed = typeof existing === 'string' ? existing.trim() : '';
      return trimmed || ``;
    });
    return next;
  }

  accountTotal(order: TableOrder, accountId: string): number {
    const account = order.accounts.find((a) => a.id === accountId);
    if (!account) return 0;
    return account.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  }

  orderTotal(order: TableOrder): number {
    return order.accounts.reduce(
      (sum, a) => sum + a.items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
      0,
    );
  }

  orderHasItems(order: TableOrder): boolean {
    return order.accounts.some((a) => a.items.some((i) => i.qty > 0));
  }

  private isItemCompleted(status: string | undefined): boolean {
    return (status ?? '').trim().toLowerCase() === 'completed';
  }

  orderAllItemsCompleted(order: TableOrder): boolean {
    const items = [];
    for (const account of order.accounts) {
      for (const item of account.items) {
        if (item.qty > 0) items.push(item);
      }
    }
    return items.length > 0 && items.every((item) => this.isItemCompleted(item.status));
  }

  canCobrar(order: TableOrder): boolean {
    return this.orderHasItems(order) && this.orderAllItemsCompleted(order);
  }
}

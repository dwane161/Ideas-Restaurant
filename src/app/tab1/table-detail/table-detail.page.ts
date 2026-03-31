import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import {
  DiningTablesService,
  type DiningTable,
  type PaymentSplit,
  type TableInvoice,
  type TableOrder,
} from '../dining-tables.service';
import { ClientesApiService } from '../../api/clientes-api.service';
import { SettingsService } from '../../settings/settings.service';

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
  private readonly clientesApi = inject(ClientesApiService);
  private readonly settingsService = inject(SettingsService);

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

  readonly clientInfo = computed(() => this.tablesService.getClientInfo(this.tableId));

  private beneficiaryPrompted = false;

  ionViewWillEnter(): void {
    // If a client is set (default or manual), beneficiary must be chosen per-order.
    const info = this.tablesService.getClientInfo(this.tableId);
    if (info.client && !info.beneficiary && !this.beneficiaryPrompted) {
      this.beneficiaryPrompted = true;
      void this.promptBeneficiary();
    }
  }

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

    const info = this.tablesService.getClientInfo(this.tableId);
    if (info.client && !info.beneficiary) {
      await this.promptBeneficiary();
      const next = this.tablesService.getClientInfo(this.tableId);
      if (!next.beneficiary) return;
    }

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

  async elegirCliente(): Promise<void> {
    const search = await this.alertController.create({
      header: 'Buscar cliente',
      inputs: [{ name: 'q', type: 'text', placeholder: 'Nombre o ID' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Buscar', role: 'confirm' },
      ],
    });
    await search.present();
    const searchResult = await search.onDidDismiss();
    if (searchResult.role !== 'confirm') return;

    const q = String(searchResult.data?.values?.q ?? '').trim();
    const res = await firstValueFrom(this.clientesApi.listClientes({ q, take: 20 }));
    const clientes = res?.clientes ?? [];
    if (clientes.length === 0) {
      const alert = await this.alertController.create({
        header: 'Sin resultados',
        message: 'No se encontraron clientes.',
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    const picker = await this.alertController.create({
      header: 'Seleccionar cliente',
      inputs: clientes.map((c) => ({
        type: 'radio',
        name: 'cliente',
        label: `${c.name} (${c.id})`,
        value: c.id,
      })),
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Seleccionar', role: 'confirm' },
      ],
    });
    await picker.present();
    const pickResult = await picker.onDidDismiss();
    if (pickResult.role !== 'confirm') return;

    const selectedId = String(pickResult.data?.values ?? pickResult.data ?? '').trim();
    const selected = clientes.find((c) => c.id === selectedId) ?? clientes[0];

    this.tablesService.setClientInfo(this.tableId, { client: selected, beneficiary: '' });
    await this.promptBeneficiary();

    const makeDefault = await this.alertController.create({
      header: 'Cliente por defecto',
      message: '¿Quieres guardar este cliente como por defecto?',
      buttons: [
        { text: 'No', role: 'cancel' },
        { text: 'Sí', role: 'confirm' },
      ],
    });
    await makeDefault.present();
    const defResult = await makeDefault.onDidDismiss();
    if (defResult.role !== 'confirm') return;

    void this.settingsService
      .setDefaultClient({ id: selected.id, name: selected.name })
      .catch(() => {});
  }

  quitarCliente(): void {
    this.tablesService.clearClientInfo(this.tableId);
  }

  imprimirOrden(): void {
    const order = this.tablesService.getOrder(this.tableId);
    if (!order) return;

    const info = this.tablesService.getClientInfo(this.tableId);
    if (info.client && !info.beneficiary) {
      void this.promptBeneficiary();
      return;
    }

    const total = this.orderTotal(order);
    const client = this.clientInfo().client;
    const beneficiary = this.clientInfo().beneficiary;

    const lines: Array<{ name: string; qty: number; unitPrice: number }> = [];
    for (const account of order.accounts) {
      for (const item of account.items) {
        if (item.qty > 0) {
          lines.push({ name: item.name, qty: item.qty, unitPrice: item.unitPrice });
        }
      }
    }

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Orden</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { font-size: 18px; margin: 0 0 8px; }
            .meta { color: #555; font-size: 12px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px; }
            .right { text-align: right; white-space: nowrap; }
            .total { font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>${this.tableLabel}</h1>
          <div class="meta">
            ${client ? `Cliente: ${client.name} (${client.id})<br/>` : ''}
            ${beneficiary ? `Beneficiario: ${beneficiary}<br/>` : ''}
            ${new Date().toLocaleString()}
          </div>
          <table>
            ${lines
              .map(
                (i) =>
                  `<tr><td>${i.qty} x ${i.name}</td><td class="right">$${(i.qty * i.unitPrice).toFixed(2)}</td></tr>`,
              )
              .join('')}
            <tr><td class="total">Total</td><td class="right total">$${total.toFixed(2)}</td></tr>
          </table>
          <script>window.print(); setTimeout(() => window.close(), 250);</script>
        </body>
      </html>
    `;

    const w = window.open('', '_blank');
    if (!w) {
      window.print();
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  itemStatusClass(status: string | undefined): string {
    const s = (status ?? '').trim().toLowerCase();
    if (s === 'completed') return 'completed';
    if (s === 'pending') return 'pending';
    if (s === 'cancelled' || s === 'canceled') return 'cancelled';
    return 'unknown';
  }

  private async promptBeneficiary(): Promise<void> {
    const info = this.tablesService.getClientInfo(this.tableId);
    if (!info.client) return;

    const beneficiary = await this.alertController.create({
      header: 'Beneficiario',
      message: 'Indica el beneficiario para esta orden.',
      inputs: [{ name: 'beneficiary', type: 'text', placeholder: 'Beneficiario', value: info.beneficiary ?? '' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Guardar', role: 'confirm' },
      ],
    });
    await beneficiary.present();
    const benResult = await beneficiary.onDidDismiss();
    if (benResult.role !== 'confirm') return;
    const value = String(benResult.data?.values?.beneficiary ?? '').trim();
    this.tablesService.setClientInfo(this.tableId, { client: info.client, beneficiary: value });
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
    return items.length > 0 && items.every((item) => this.isItemCompleted(item.statusCode));
  }

  canCobrar(order: TableOrder): boolean {
    return this.orderHasItems(order) && this.orderAllItemsCompleted(order);
  }
}

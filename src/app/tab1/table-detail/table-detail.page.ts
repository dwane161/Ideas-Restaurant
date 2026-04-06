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

  // We keep "shared" as the only mode in the UI. If peopleCount is 1, it behaves like single-account.
  readonly billingMode = signal<BillingMode>('shared');
  readonly peopleCount = signal<number>(1);
  readonly accountNames = signal<string[]>(['']);

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
    // For older orders that may not have beneficiary yet, enforce it when table is occupied.
    const t = this.tablesService.getTable(this.tableId);
    if (t?.status !== 'occupied') return;

    const info = this.tablesService.getClientInfo(this.tableId);
    const order = this.tablesService.getOrder(this.tableId);
    const accountCount = order?.accounts?.length ?? 0;

    if (!info.beneficiary && accountCount > 1) {
      // For shared orders, keep beneficiary implicit.
      this.tablesService.setClientInfo(this.tableId, { client: info.client, beneficiary: 'Varios' });
      return;
    }

    if (!info.beneficiary && !this.beneficiaryPrompted) {
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

  async openTable(): Promise<void> {
    const info = this.tablesService.getClientInfo(this.tableId);
    const count = this.clampPeopleCount(this.peopleCount());
    // Pass empty names; backend/service will create "Cuenta 1..N".
    const names = this.normalizeAccountNames(this.accountNames(), count);

    if (count <= 1) {
      // Single beneficiary required.
      if (!info.beneficiary) {
        const ok = await this.promptBeneficiary();
        if (!ok) return;
        const next = this.tablesService.getClientInfo(this.tableId);
        if (!next.beneficiary) return;
      }
    } else {
      // Multiple beneficiaries: require a name for each account and auto-set order beneficiary.
      const missing = names.some((n) => !n.trim());
      if (missing) {
        const alert = await this.alertController.create({
          header: 'Beneficiarios requeridos',
          message: 'Debes indicar el nombre de cada beneficiario para continuar.',
          buttons: ['OK'],
        });
        await alert.present();
        return;
      }

      if (!info.beneficiary) {
        this.tablesService.setClientInfo(this.tableId, { client: info.client, beneficiary: 'Varios' });
      }
    }
    this.tablesService.openTable(this.tableId, 'shared', names);
    this.irAMenu();
  }

  async cobrar(): Promise<void> {
    const order = this.tablesService.getOrder(this.tableId);
    if (!order) return;

    const info = this.tablesService.getClientInfo(this.tableId);
    if (!info.beneficiary) {
      const ok = await this.promptBeneficiary();
      if (!ok) return;
      const next = this.tablesService.getClientInfo(this.tableId);
      if (!next.beneficiary) return;
    }

    if (!this.canCobrar(order)) {
      const message = this.orderHasItems(order)
        ? 'Solo se puede cerrar la orden cuando todos los items estén en estado COMPLETED.'
        : 'Agrega al menos un plato antes de cerrar la orden.';
      const alert = await this.alertController.create({
        header: 'No se puede cerrar la orden',
        message,
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    const total = this.orderTotal(order);

    const confirm = await this.alertController.create({
      header: 'Cerrar orden',
      message: `Total: $${total.toFixed(2)}`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cerrar', role: 'confirm' },
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

  itemStatusClass(status: string | undefined): string {
    const s = (status ?? '').trim().toLowerCase();
    if (s === 'completed') return 'completed';
    if (s === 'pending') return 'pending';
    if (s === 'cancelled' || s === 'canceled') return 'cancelled';
    return 'unknown';
  }

  private async promptBeneficiary(): Promise<boolean> {
    const info = this.tablesService.getClientInfo(this.tableId);
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
    if (benResult.role !== 'confirm') return false;
    const value = String(benResult.data?.values?.beneficiary ?? '').trim();
    if (!value) {
      const alert = await this.alertController.create({
        header: 'Beneficiario requerido',
        message: 'Debes indicar un beneficiario para continuar.',
        buttons: ['OK'],
      });
      await alert.present();
      return false;
    }
    this.tablesService.setClientInfo(this.tableId, { client: info.client, beneficiary: value });
    return true;
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
    const safe = Number.isFinite(value) ? Math.trunc(value) : 1;
    return Math.min(12, Math.max(1, safe));
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

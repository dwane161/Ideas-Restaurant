import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import {
  DiningTablesService,
  type PaymentMethod,
  type PaymentSplit,
  type TableOrder,
} from '../dining-tables.service';
import { ClientesApiService } from '../../api/clientes-api.service';
import { SettingsService } from '../../settings/settings.service';

@Component({
  selector: 'app-table-payment',
  templateUrl: './table-payment.page.html',
  styleUrls: ['./table-payment.page.scss'],
  standalone: false,
})
export class TablePaymentPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly tablesService = inject(DiningTablesService);
  private readonly clientesApi = inject(ClientesApiService);
  private readonly settingsService = inject(SettingsService);

  private readonly tableId = Number(this.route.snapshot.paramMap.get('id'));

  readonly method = signal<PaymentMethod>('percentage');
  readonly percentageInputs = signal<string[]>([]);
  readonly amountInputs = signal<string[]>([]);

  readonly order = computed<TableOrder | undefined>(() =>
    this.tablesService.getOrder(this.tableId),
  );

  readonly clientInfo = computed(() => this.tablesService.getClientInfo(this.tableId));
  private beneficiaryPrompted = false;

  readonly canCobrar = computed<boolean>(() => {
    const order = this.order();
    if (!order) return false;
    return this.orderHasItems(order) && this.orderAllItemsCompleted(order);
  });

  readonly total = computed<number>(() => {
    const order = this.order();
    if (!order) return 0;
    return order.accounts.reduce(
      (sum, a) => sum + a.items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
      0,
    );
  });

  readonly isShared = computed(() => (this.order()?.accounts.length ?? 0) > 1);

  readonly isValid = computed(() => {
    const order = this.order();
    if (!order) return false;
    if (order.accounts.length < 2) return true;

    const total = this.total();
    if (total <= 0) return false;

    if (this.method() === 'percentage') {
      const values = this.percentages();
      const sum = values.reduce((s, v) => s + v, 0);
      return Math.abs(sum - 100) < 0.01;
    }

    const values = this.amounts();
    const sum = values.reduce((s, v) => s + v, 0);
    return Math.abs(sum - total) < 0.01;
  });

  readonly canConfirmPayment = computed(() => this.isValid() && this.canCobrar());

  get tableLabel(): string {
    return `Mesa ${String(this.tableId).padStart(2, '0')}`;
  }

  ionViewWillEnter(): void {
    const order = this.tablesService.getOrder(this.tableId);
    if (!order) return;

    const count = order.accounts.length;
    if (count <= 1) return;

    if (this.percentageInputs().length !== count) {
      const even = (100 / count).toFixed(2);
      this.percentageInputs.set(Array.from({ length: count }, () => even));
    }

    if (this.amountInputs().length !== count) {
      this.amountInputs.set(Array.from({ length: count }, () => '0'));
    }

    const info = this.tablesService.getClientInfo(this.tableId);
    if (info.client && !info.beneficiary && !this.beneficiaryPrompted) {
      this.beneficiaryPrompted = true;
      void this.promptBeneficiary();
    }
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

  setMethod(value: unknown): void {
    this.method.set(value === 'amounts' ? 'amounts' : 'percentage');
  }

  setPercentage(index: number, value: unknown): void {
    const next = [...this.percentageInputs()];
    next[index] = typeof value === 'string' ? value : String(value ?? '');
    this.percentageInputs.set(next);
  }

  setAmount(index: number, value: unknown): void {
    const next = [...this.amountInputs()];
    next[index] = typeof value === 'string' ? value : String(value ?? '');
    this.amountInputs.set(next);
  }

  percentages(): number[] {
    const order = this.order();
    if (!order) return [];
    return order.accounts.map((_, idx) => this.parseNumber(this.percentageInputs()[idx]));
  }

  amountFromPercentage(index: number): number {
    const total = this.total();
    if (total <= 0) return 0;
    const percent = this.parseNumber(this.percentageInputs()[index]);
    return (total * percent) / 100;
  }

  amounts(): number[] {
    const order = this.order();
    if (!order) return [];
    return order.accounts.map((_, idx) => this.parseNumber(this.amountInputs()[idx]));
  }

  async confirmPayment(): Promise<void> {
    const order = this.order();
    if (!order) return;

    const info = this.tablesService.getClientInfo(this.tableId);
    if (info.client && !info.beneficiary) {
      await this.promptBeneficiary();
      const next = this.tablesService.getClientInfo(this.tableId);
      if (!next.beneficiary) return;
    }

    if (!this.canCobrar()) {
      const alert = await this.alertController.create({
        header: 'No se puede cobrar',
        message:
          'Solo se puede cobrar cuando la orden tiene items y todos están en estado COMPLETED.',
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    if (!this.isValid()) {
      const alert = await this.alertController.create({
        header: 'Revisa el cobro',
        message:
          this.method() === 'percentage'
            ? 'Los porcentajes deben sumar 100%.'
            : 'Los montos deben sumar el total.',
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    const total = this.total();
    const method = this.method();

    let splits: PaymentSplit[] = [];
    if (order.accounts.length <= 1) {
      const a = order.accounts[0];
      splits = [
        {
          accountId: a.id,
          accountName: a.name,
          amount: total,
        },
      ];
    } else if (method === 'percentage') {
      const percents = this.percentages();
      splits = order.accounts.map((a, idx) => ({
        accountId: a.id,
        accountName: a.name,
        percent: percents[idx],
        amount: (total * percents[idx]) / 100,
      }));
    } else {
      const amounts = this.amounts();
      splits = order.accounts.map((a, idx) => ({
        accountId: a.id,
        accountName: a.name,
        amount: amounts[idx],
      }));
    }

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

    const invoice = this.tablesService.payOrder(this.tableId, method, splits);
    if (!invoice) return;

    this.router.navigate([`/tabs/tab1/mesa/${this.tableId}/factura`]);
  }

  private orderHasItems(order: TableOrder): boolean {
    return order.accounts.some((a) => a.items.some((i) => i.qty > 0));
  }

  private isItemCompleted(status: string | undefined): boolean {
    return (status ?? '').trim().toLowerCase() === 'completed';
  }

  private orderAllItemsCompleted(order: TableOrder): boolean {
    const items = [];
    for (const account of order.accounts) {
      for (const item of account.items) {
        if (item.qty > 0) items.push(item);
      }
    }
    return items.length > 0 && items.every((item) => this.isItemCompleted(item.statusCode));
  }

  private parseNumber(value: unknown): number {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    const normalized = raw.replace(',', '.');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
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
}

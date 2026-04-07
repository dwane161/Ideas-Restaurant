import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { isAndroidNative, printHtml } from '../../printing/android-printer';
import {
  DiningTablesService,
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

  readonly canPrint = computed<boolean>(() => {
    const order = this.order();
    if (!order) return false;
    return this.orderHasItems(order);
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

  readonly accountAmounts = computed(() => {
    const order = this.order();
    if (!order) return [];
    return order.accounts.map((a) => {
      const amount = a.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
      const itemCount = a.items.reduce((s, i) => s + (i.qty ?? 0), 0);
      return {
        accountId: a.id,
        accountName: a.name,
        amount,
        itemCount,
      };
    });
  });

  readonly canConfirmPayment = computed(() => this.canCobrar() && this.total() > 0);

  get tableLabel(): string {
    return `Mesa ${String(this.tableId).padStart(2, '0')}`;
  }

  ionViewWillEnter(): void {
    const order = this.tablesService.getOrder(this.tableId);
    if (!order) return;

    const info = this.tablesService.getClientInfo(this.tableId);
    if (!info.beneficiary && order.accounts.length > 1) {
      this.tablesService.setClientInfo(this.tableId, { client: info.client, beneficiary: 'Varios' });
      return;
    }
    if (!info.beneficiary && !this.beneficiaryPrompted) {
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

  async confirmPayment(): Promise<void> {
    const order = this.order();
    if (!order) return;

    const info = this.tablesService.getClientInfo(this.tableId);
    if (!info.beneficiary && order.accounts.length > 1) {
      this.tablesService.setClientInfo(this.tableId, { client: info.client, beneficiary: 'Varios' });
    }
    if (!info.beneficiary) {
      await this.promptBeneficiary();
      const next = this.tablesService.getClientInfo(this.tableId);
      if (!next.beneficiary) return;
    }

    if (!this.canCobrar()) {
      const alert = await this.alertController.create({
        header: 'No se puede cerrar la orden',
        message:
          'Solo se puede cerrar la orden cuando tiene items y todos están en estado COMPLETED.',
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    const total = this.total();
    const splits: PaymentSplit[] =
      order.accounts.length <= 1
        ? [
            {
              accountId: order.accounts[0].id,
              accountName: order.accounts[0].name,
              amount: total,
            },
          ]
        : this.accountAmounts().map((a) => ({
            accountId: a.accountId,
            accountName: a.accountName,
            amount: a.amount,
          }));

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

    const invoice = this.tablesService.payOrder(this.tableId, 'amounts', splits);
    if (!invoice) return;

    this.router.navigate([`/tabs/tab1/mesa/${this.tableId}/factura`]);
  }

  async imprimirCobro(): Promise<void> {
    const order = this.order();
    if (!order) return;

    const info = this.tablesService.getClientInfo(this.tableId);
    if (!info.beneficiary && order.accounts.length > 1) {
      this.tablesService.setClientInfo(this.tableId, { client: info.client, beneficiary: 'Varios' });
    }
    if (!info.beneficiary) {
      await this.promptBeneficiary();
      const next = this.tablesService.getClientInfo(this.tableId);
      if (!next.beneficiary) return;
    }

	    const total = this.total();
	    const client = this.clientInfo().client;
	    const beneficiary = this.clientInfo().beneficiary;
	
	    const nativeText = this.buildEscPosPayment(order, total, client?.name ?? null, client?.id ?? null, beneficiary ?? null);
	    if (isAndroidNative()) {
	      try {
	        const html = this.buildHtmlPayment(order, total, client, beneficiary, false);
	        await printHtml({ name: `${this.tableLabel} - Cobro`, html });
	        return;
	      } catch (err: unknown) {
	        const message = err instanceof Error ? err.message : String(err ?? 'No se pudo imprimir.');
	        const alert = await this.alertController.create({
	          header: 'No se pudo imprimir',
	          message:
	            `${message}\n\n` +
	            `Esta tableta tiene impresora integrada; si falla, necesitamos el SDK/servicio del fabricante.`,
	          buttons: ['OK'],
	        });
	        await alert.present();
	        return;
	      }
	    }

	    const html = this.buildHtmlPayment(order, total, client, beneficiary, true);

	    const w = window.open('', '_blank');
	    if (!w) {
	      window.print();
      return;
    }
    w.document.open();
	    w.document.write(html);
	    w.document.close();
	  }

  private buildHtmlPayment(order: TableOrder, total: number, client: { id: string; name: string } | null, beneficiary: string | null, autoPrint: boolean): string {
    const accountSections = order.accounts.map((account) => {
      const amount = account.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
      const lines = account.items
        .filter((i) => i.qty > 0)
        .map(
          (i) =>
            `<tr><td>${i.qty} x ${this.escapeHtml(i.name)}</td><td class="right">$${(i.qty * i.unitPrice).toFixed(2)}</td></tr>`,
        )
        .join('');

      const title = `${this.escapeHtml(account.name)} — $${amount.toFixed(2)}`;

      return `
        <div class="section">
          <div class="section-title">${title}</div>
          <table>
            ${lines || `<tr><td colspan="2" class="muted">Sin productos.</td></tr>`}
          </table>
        </div>
      `;
    });

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Cobro</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { font-size: 18px; margin: 0 0 8px; }
            .meta { color: #555; font-size: 12px; margin-bottom: 10px; }
            .section { margin: 14px 0; }
            .section-title { font-weight: 700; font-size: 13px; margin: 0 0 6px; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px; }
            .right { text-align: right; white-space: nowrap; }
            .muted { color: #777; font-size: 12px; padding: 10px 0; }
            .total { font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>${this.tableLabel}</h1>
          <div class="meta">
            ${client ? `Cliente: ${this.escapeHtml(client.name)} (${this.escapeHtml(client.id)})<br/>` : ''}
            ${beneficiary ? `Beneficiario: ${this.escapeHtml(beneficiary)}<br/>` : ''}
            ${new Date().toLocaleString()}
          </div>
          ${accountSections.join('')}
          <table>
            <tr><td class="total">Total</td><td class="right total">$${total.toFixed(2)}</td></tr>
          </table>
          ${autoPrint ? `<script>window.print(); setTimeout(() => window.close(), 250);</script>` : ''}
        </body>
      </html>
    `;
  }

  private buildEscPosPayment(order: TableOrder, total: number, clientName: string | null, clientId: string | null, beneficiary: string | null): string {
    const line = '[L]--------------------------------\\n';
    const header =
      `[C]<b>${this.tableLabel}</b>\\n` +
      (clientName && clientId ? `[L]Cliente: ${clientName} (${clientId})\\n` : '') +
      (beneficiary ? `[L]Beneficiario: ${beneficiary}\\n` : '') +
      `[L]${new Date().toLocaleString()}\\n` +
      line;

    const accounts = order.accounts
      .map((account) => {
        const amount = account.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
        const lines = account.items
          .filter((i) => i.qty > 0)
          .map((i) => {
            const itemTotal = (i.qty * i.unitPrice).toFixed(2);
            const note = i.note ? `\\n[L]  ${i.note}` : '';
            return `[L]${i.qty}x ${i.name}[R]$${itemTotal}${note}\\n`;
          })
          .join('');
        return `${line}[C]<b>${account.name}</b>\\n${lines || '[L]Sin productos.\\n'}[L]Subtotal[R]$${amount.toFixed(2)}\\n`;
      })
      .join('');

    const footer = `${line}[L]<b>Total</b>[R]<b>$${total.toFixed(2)}</b>\\n\\n\\n`;
    return header + accounts + footer;
  }

  private orderHasItems(order: TableOrder): boolean {
    return order.accounts.some((a) => a.items.some((i) => i.qty > 0));
  }

  private escapeHtml(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  private async promptBeneficiary(): Promise<void> {
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
    if (benResult.role !== 'confirm') return;
    const value = String(benResult.data?.values?.beneficiary ?? '').trim();
    this.tablesService.setClientInfo(this.tableId, { client: info.client, beneficiary: value });
  }
}

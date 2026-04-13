import { Component, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DiningTablesService, type OrderItem, type TableInvoice } from '../dining-tables.service';
import { isAndroidNative, printHtml } from '../../printing/android-printer';
import { AlertController } from '@ionic/angular';
import { BusinessApiService, type BusinessInfo } from '../../api/business-api.service';

@Component({
  selector: 'app-table-invoice',
  templateUrl: './table-invoice.page.html',
  styleUrls: ['./table-invoice.page.scss'],
  standalone: false,
})
export class TableInvoicePage {
  private readonly tableId = Number(this.route.snapshot.paramMap.get('id'));
  private readonly LEGAL_TIP_RATE = 0.1;

  readonly invoice = computed<TableInvoice | undefined>(() =>
    this.tablesService.getInvoice(this.tableId),
  );

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly tablesService: DiningTablesService,
    private readonly alertController: AlertController,
    private readonly businessApi: BusinessApiService,
  ) {}

  get tableLabel(): string {
    return `Mesa ${String(this.tableId).padStart(2, '0')}`;
  }

  close(): void {
    this.router.navigate(['/tabs/tab1']);
  }

  accountTotal(items: OrderItem[]): number {
    return items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  }

  invoiceSubtotal(inv: TableInvoice): number {
    return Number(inv.total ?? 0);
  }

  invoiceLegalTip(inv: TableInvoice): number {
    const subtotal = this.invoiceSubtotal(inv);
    return subtotal * this.LEGAL_TIP_RATE;
  }

  invoiceGrandTotal(inv: TableInvoice): number {
    return this.invoiceSubtotal(inv) + this.invoiceLegalTip(inv);
  }

  splitTotalsWithTip(inv: TableInvoice): Array<{
    accountId: string;
    accountName: string;
    subtotal: number;
    tip: number;
    total: number;
    percent?: number;
  }> {
    const subtotalByAccountId = new Map<string, number>();
    for (const a of inv.order.accounts ?? []) {
      subtotalByAccountId.set(a.id, this.accountTotal(a.items ?? []));
    }

    const subtotalCents = Math.round(this.invoiceSubtotal(inv) * 100);
    if (subtotalCents <= 0) {
      return (inv.splits ?? []).map((s) => ({
        accountId: s.accountId,
        accountName: s.accountName,
        subtotal: subtotalByAccountId.get(s.accountId) ?? Number(s.amount ?? 0),
        tip: 0,
        total: Number(s.amount ?? 0),
        percent: s.percent,
      }));
    }

    const totalTipCents = Math.round(subtotalCents * this.LEGAL_TIP_RATE);

    const splits = (inv.splits ?? []).map((s) => {
      const accountSubtotal = subtotalByAccountId.get(s.accountId) ?? Number(s.amount ?? 0);
      return { ...s, _subtotalCents: Math.round(accountSubtotal * 100) };
    });

    let usedTipCents = 0;
    const out: Array<{
      accountId: string;
      accountName: string;
      subtotal: number;
      tip: number;
      total: number;
      percent?: number;
    }> = [];

    splits.forEach((s, index) => {
      const isLast = index === splits.length - 1;
      const shareCents = isLast
        ? totalTipCents - usedTipCents
        : Math.floor((totalTipCents * s._subtotalCents) / subtotalCents);
      usedTipCents += shareCents;

      const subtotal = s._subtotalCents / 100;
      const tip = shareCents / 100;
      out.push({
        accountId: s.accountId,
        accountName: s.accountName,
        subtotal,
        tip,
        total: subtotal + tip,
        percent: s.percent,
      });
    });

    return out;
  }

  imprimirFactura(): void {
    const inv = this.invoice();
    if (!inv) return;

    const info = this.tablesService.getClientInfo(this.tableId);
    const client = info.client;
    const beneficiary = info.beneficiary;

    void this.imprimirFacturaInternal(inv, client?.name ?? null, client?.id ?? null, beneficiary ?? null);
  }

  private async imprimirFacturaInternal(
    inv: TableInvoice,
    clientName: string | null,
    clientId: string | null,
    beneficiary: string | null,
  ): Promise<void> {
    let business: BusinessInfo | null = null;
    try {
      business = await this.businessApi.getBusiness();
    } catch {
      // best effort: print without business data
      business = null;
    }

    if (isAndroidNative()) {
      const html = this.buildHtmlInvoice(inv, business, clientName, clientId, beneficiary, false);
      try {
        await printHtml({ name: `${this.tableLabel} - Orden`, html });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err ?? 'No se pudo imprimir.');
        const alert = await this.alertController.create({
          header: 'No se pudo imprimir',
          message,
          buttons: ['OK'],
        });
        await alert.present();
      }
      return;
    }

    this.printViaBrowser(inv, business, clientName, clientId, beneficiary);
  }

  private buildEscPosInvoice(inv: TableInvoice, clientName: string | null, clientId: string | null, beneficiary: string | null): string {
    const line = '[L]--------------------------------\\n';
    const header = `[C]<b>${this.tableLabel}</b>\\n` +
      (clientName && clientId ? `[L]Cliente: ${clientName} (${clientId})\\n` : '') +
      (beneficiary ? `[L]Beneficiario: ${beneficiary}\\n` : '') +
      `[L]${new Date(inv.createdAtIso).toLocaleString()}\\n` +
      line;

    const splits = this.splitTotalsWithTip(inv)
      .map((s) => `[L]${s.accountName}[R]$${Number(s.total).toFixed(2)}\\n`)
      .join('');

    const accounts = inv.order.accounts
      .map((account) => {
        const items = (account.items ?? [])
          .filter((i) => (i.qty ?? 0) > 0)
          .map((i) => {
            const amount = (i.qty * i.unitPrice).toFixed(2);
            const note = i.note ? `\\n[L]  ${i.note}` : '';
            return `[L]${i.qty}x ${i.name}[R]$${amount}${note}\\n`;
          })
          .join('');
        const total = this.accountTotal(account.items ?? []);
        return `${line}[C]<b>${account.name}</b>\\n${items || '[L]Sin productos.\\n'}[L]Subtotal[R]$${total.toFixed(2)}\\n`;
      })
      .join('');

    const subtotal = this.invoiceSubtotal(inv);
    const tip = this.invoiceLegalTip(inv);
    const grand = this.invoiceGrandTotal(inv);

    const total =
      `${line}[L]Subtotal[R]$${subtotal.toFixed(2)}\\n` +
      `[L]Propina legal (10%)[R]$${tip.toFixed(2)}\\n` +
      `[L]<b>Total</b>[R]<b>$${grand.toFixed(2)}</b>\\n\\n\\n`;

    return header + `[C]Pago por cuentas\\n` + splits + accounts + total;
  }

  private buildHtmlInvoice(
    inv: TableInvoice,
    business: BusinessInfo | null,
    clientName: string | null,
    clientId: string | null,
    beneficiary: string | null,
    autoPrint: boolean,
  ): string {
    const splitLines = this.splitTotalsWithTip(inv)
      .map((s) => `<tr><td>${this.escapeHtml(s.accountName)}</td><td class="right">$${Number(s.total).toFixed(2)}</td></tr>`)
      .join('');

    const businessLines = [
      business?.name ? `<div class="biz-name">${this.escapeHtml(business.name)}</div>` : '',
      business?.rnc ? `<div class="biz-line">RNC: ${this.escapeHtml(business.rnc)}</div>` : '',
      business?.address ? `<div class="biz-line">${this.escapeHtml(business.address)}</div>` : '',
      business?.phone ? `<div class="biz-line">Tel: ${this.escapeHtml(business.phone)}</div>` : '',
      business?.email ? `<div class="biz-line">${this.escapeHtml(business.email)}</div>` : '',
    ]
      .filter(Boolean)
      .join('');

    const accountsHtml = inv.order.accounts
      .map((account) => {
        const rows = (account.items ?? [])
          .filter((i) => (i.qty ?? 0) > 0)
          .map((i) => {
            const note = i.note ? `<div class="note">${this.escapeHtml(i.note)}</div>` : '';
            return `<tr><td>${i.qty} x ${this.escapeHtml(i.name)}${note}</td><td class="right">$${(i.qty * i.unitPrice).toFixed(2)}</td></tr>`;
          })
          .join('');

        const total = this.accountTotal(account.items ?? []);
        return `
          <div class="section">
            <div class="section-title">${this.escapeHtml(account.name)} — $${total.toFixed(2)}</div>
            <table>
              ${rows || `<tr><td colspan="2" class="muted">Sin productos.</td></tr>`}
            </table>
          </div>
        `;
      })
      .join('');

    const subtotal = this.invoiceSubtotal(inv);
    const tip = this.invoiceLegalTip(inv);
    const grand = this.invoiceGrandTotal(inv);

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Orden</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { font-size: 18px; margin: 0 0 8px; }
            .meta { color: #555; font-size: 12px; margin-bottom: 10px; }
            .biz { text-align: center; margin-bottom: 10px; }
            .biz-name { font-weight: 900; font-size: 16px; margin-bottom: 4px; }
            .biz-line { font-size: 12px; color: #444; }
            .section { margin: 14px 0; }
            .section-title { font-weight: 700; font-size: 13px; margin: 0 0 6px; }
            .note { color: #666; font-size: 12px; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
            .right { text-align: right; white-space: nowrap; }
            .muted { color: #777; font-size: 12px; padding: 10px 0; }
            .total { font-weight: 700; }
            .hr { height: 1px; background: #eee; margin: 10px 0; }
          </style>
        </head>
        <body>
          ${businessLines ? `<div class="biz">${businessLines}</div><div class="hr"></div>` : ''}
          <h1>${this.tableLabel}</h1>
          <div class="meta">
            Orden: ${this.escapeHtml(inv.id)}<br/>
            ${clientName && clientId ? `Cliente: ${this.escapeHtml(clientName)} (${this.escapeHtml(clientId)})<br/>` : ''}
            ${beneficiary ? `Beneficiario: ${this.escapeHtml(beneficiary)}<br/>` : ''}
            ${new Date(inv.createdAtIso).toLocaleString()}
          </div>
          <div class="section">
            <div class="section-title">Pago por cuentas</div>
            <table>${splitLines}</table>
          </div>
          <div class="hr"></div>
          ${accountsHtml}
          <table>
            <tr><td>Subtotal</td><td class="right">$${subtotal.toFixed(2)}</td></tr>
            <tr><td>Propina legal (10%)</td><td class="right">$${tip.toFixed(2)}</td></tr>
            <tr><td class="total">Total</td><td class="right total">$${grand.toFixed(2)}</td></tr>
          </table>
          ${autoPrint ? `<script>window.print(); setTimeout(() => window.close(), 250);</script>` : ''}
        </body>
      </html>
    `;
  }

  private printViaBrowser(inv: TableInvoice, business: BusinessInfo | null, clientName: string | null, clientId: string | null, beneficiary: string | null): void {
    const html = this.buildHtmlInvoice(inv, business, clientName, clientId, beneficiary, true);

    const w = window.open('', '_blank');
    if (!w) {
      window.print();
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  private escapeHtml(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

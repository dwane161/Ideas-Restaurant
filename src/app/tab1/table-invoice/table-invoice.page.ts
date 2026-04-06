import { Component, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DiningTablesService, type OrderItem, type TableInvoice } from '../dining-tables.service';

@Component({
  selector: 'app-table-invoice',
  templateUrl: './table-invoice.page.html',
  styleUrls: ['./table-invoice.page.scss'],
  standalone: false,
})
export class TableInvoicePage {
  private readonly tableId = Number(this.route.snapshot.paramMap.get('id'));

  readonly invoice = computed<TableInvoice | undefined>(() =>
    this.tablesService.getInvoice(this.tableId),
  );

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly tablesService: DiningTablesService,
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

  imprimirFactura(): void {
    const inv = this.invoice();
    if (!inv) return;

    const info = this.tablesService.getClientInfo(this.tableId);
    const client = info.client;
    const beneficiary = info.beneficiary;

    const splitLines = inv.splits
      .map((s) => `<tr><td>${this.escapeHtml(s.accountName)}</td><td class="right">$${Number(s.amount).toFixed(2)}</td></tr>`)
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

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Factura</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { font-size: 18px; margin: 0 0 8px; }
            .meta { color: #555; font-size: 12px; margin-bottom: 10px; }
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
          <h1>${this.tableLabel}</h1>
          <div class="meta">
            Factura: ${this.escapeHtml(inv.id)}<br/>
            ${client ? `Cliente: ${this.escapeHtml(client.name)} (${this.escapeHtml(client.id)})<br/>` : ''}
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
            <tr><td class="total">Total</td><td class="right total">$${Number(inv.total).toFixed(2)}</td></tr>
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

  private escapeHtml(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

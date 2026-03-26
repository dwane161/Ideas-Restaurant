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
}

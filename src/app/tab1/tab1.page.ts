import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { DiningTablesService, type TableStatus } from './dining-tables.service';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page {

  readonly tables = this.tablesService.tables;
  readonly availableCount = this.tablesService.availableCount;
  readonly totalCount = this.tablesService.totalCount;
  readonly isOrdersLoading = this.tablesService.isOrdersLoading;
  readonly hasOrdersLoaded = this.tablesService.hasOrdersLoaded;
  readonly user = this.auth.user;

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly router: Router,
    private readonly tablesService: DiningTablesService,
    private readonly auth: AuthService,
  ) {}

  ionViewDidEnter(): void {
    this.tablesService.refreshOrdersFromBackend();
    this.startPolling();
  }

  ionViewWillLeave(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.tablesService.refreshOrdersFromBackend();
    }, 5000);
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  getOrderItemCount(tableId: number): number {
    const order = this.tablesService.getOrder(tableId);
    if (!order) return 0;
    return order.accounts.reduce(
      (sum, a) => sum + a.items.reduce((s, i) => s + (i.qty ?? 0), 0),
      0,
    );
  }

  handleRefresh(event: Event): void {
    const refresher = event?.target as { complete?: () => void } | null;
    this.tablesService.refreshOrdersFromBackend(() => refresher?.complete?.());
  }

  openTableDetail(tableId: number): void {
    this.tablesService.selectTable(tableId);
    this.router.navigate(['/tabs/tab1/mesa', tableId]);
  }

  getStatusLabel(status: TableStatus): string {
    switch (status) {
      case 'available': return 'DISPONIBLE';
      case 'occupied': return 'OCUPADA';
      case 'pending': return 'PAGADO';
      case 'cleaning': return 'LIMPIANDO';
    }
    return '—';
  }

}

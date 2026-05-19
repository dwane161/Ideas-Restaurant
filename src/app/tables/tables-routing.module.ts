import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TablesPage } from './tables.page';
import { TableDetailPage } from './table-detail/table-detail.page';
import { TableInvoicePage } from './table-invoice/table-invoice.page';
import { TablePaymentPage } from './table-payment/table-payment.page';

const routes: Routes = [
  {
    path: '',
    component: TablesPage,
  }
  ,
  {
    path: 'mesa/:id',
    component: TableDetailPage,
  },
  {
    path: 'mesa/:id/pago',
    component: TablePaymentPage,
  },
  {
    path: 'mesa/:id/factura',
    component: TableInvoicePage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TablesPageRoutingModule {}

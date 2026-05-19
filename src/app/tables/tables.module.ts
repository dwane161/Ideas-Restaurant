import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TablesPage } from './tables.page';
import { TableDetailPage } from './table-detail/table-detail.page';
import { TableInvoicePage } from './table-invoice/table-invoice.page';
import { TablePaymentPage } from './table-payment/table-payment.page';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { TablesPageRoutingModule } from './tables-routing.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ExploreContainerComponentModule,
    TablesPageRoutingModule
  ],
  declarations: [TablesPage, TableDetailPage, TablePaymentPage, TableInvoicePage]
})
export class TablesPageModule {}

import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Tab1Page } from './tab1.page';
import { TableDetailPage } from './table-detail/table-detail.page';
import { TableInvoicePage } from './table-invoice/table-invoice.page';
import { TablePaymentPage } from './table-payment/table-payment.page';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { Tab1PageRoutingModule } from './tab1-routing.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ExploreContainerComponentModule,
    Tab1PageRoutingModule
  ],
  declarations: [Tab1Page, TableDetailPage, TablePaymentPage, TableInvoicePage]
})
export class Tab1PageModule {}

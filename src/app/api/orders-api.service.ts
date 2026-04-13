import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SettingsService } from '../settings/settings.service';

export type BillingMode = 'single' | 'shared';
export type PaymentMethod = 'percentage' | 'amounts';

export interface OpenOrderRequest {
  tableId: number;
  billingMode: BillingMode;
  accountNames?: string[];
  createdByUserId?: string;
  clientId?: string;
  clientName?: string;
  beneficiary?: string;
}

export interface OpenOrderResponse {
  order: {
    id: string;
    tableId: number;
    status: string;
    billingMode: BillingMode;
    createdByUserId?: string | null;
    accounts: { key: string; name: string }[];
  };
}

export interface AddItemRequest {
  accountKey: string;
  productId: string;
  productName: string;
  unitPrice: number;
  qtyDelta: number;
  note?: string;
}

export interface CancelItemRequest {
  accountKey: string;
  productId: string;
}

export interface PayRequest {
  method: PaymentMethod;
  splits: { accountKey: string; amount: number; percent?: number }[];
}

export interface RemoteOrder {
  id: string;
  tableId: number;
  status: string;
  createdAtIso?: string;
  statusLabel?: string;
  tableStatus?: string | null;
  statusColor?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  beneficiary?: string | null;
  billingMode: BillingMode;
  invoice?: {
    id: string;
    createdAtIso: string;
    method: PaymentMethod;
    total: number;
    splits: Array<{
      accountKey: string;
      accountName: string;
      amount: number;
      percent: number | null;
    }>;
  } | null;
  accounts: Array<{
    key: string;
    name: string;
    items: Array<{
      id: string;
      name: string;
      qty: number;
      unitPrice: number;
      statusCode?: string;
      statusLabel?: string;
      statusColor?: string | null;
      note?: string | null;
      // Back-compat (older backend)
      status?: string;
    }>;
  }>;
}

export interface GetOrderByTableResponse {
  order: RemoteOrder | null;
}

export interface ListOrdersResponse {
  orders: RemoteOrder[];
}

@Injectable({ providedIn: 'root' })
export class OrdersApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly settings: SettingsService,
  ) {}

  openOrder(body: OpenOrderRequest): Observable<OpenOrderResponse> {
    return this.http.post<OpenOrderResponse>(`${this.settings.apiBaseUrl()}/orders/open`, body);
  }

  addItem(orderId: string, body: AddItemRequest): Observable<unknown> {
    return this.http.post(`${this.settings.apiBaseUrl()}/orders/${orderId}/items`, body);
  }

  cancelItem(orderId: string, body: CancelItemRequest): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.settings.apiBaseUrl()}/orders/${orderId}/items/cancel`, body);
  }

  pay(orderId: string, body: PayRequest): Observable<unknown> {
    return this.http.post(`${this.settings.apiBaseUrl()}/orders/${orderId}/pay`, body);
  }

  getOrderByTable(tableId: number, status?: string): Observable<GetOrderByTableResponse> {
    const params = status ? { status } : undefined;
    return this.http.get<GetOrderByTableResponse>(`${this.settings.apiBaseUrl()}/orders/by-table/${tableId}`, { params });
  }

  listOrders(status?: string): Observable<ListOrdersResponse> {
    const params = status ? { status } : undefined;
    return this.http.get<ListOrdersResponse>(`${this.settings.apiBaseUrl()}/orders`, { params });
  }

  setOrderStatus(orderId: string, status: 'open' | 'paid' | 'cleaning' | 'closed'): Observable<unknown> {
    return this.http.patch(`${this.settings.apiBaseUrl()}/orders/${orderId}/status`, { status });
  }

  setOrderClient(orderId: string, body: { clientId: string | null; clientName: string | null; beneficiary: string | null }): Observable<unknown> {
    return this.http.patch(`${this.settings.apiBaseUrl()}/orders/${orderId}/client`, body);
  }
}

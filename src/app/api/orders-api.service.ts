import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type BillingMode = 'single' | 'shared';
export type PaymentMethod = 'percentage' | 'amounts';

export interface OpenOrderRequest {
  tableId: number;
  billingMode: BillingMode;
  accountNames?: string[];
  createdByUserId?: string;
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
}

export interface PayRequest {
  method: PaymentMethod;
  splits: { accountKey: string; amount: number; percent?: number }[];
}

export interface RemoteOrder {
  id: string;
  tableId: number;
  status: string;
  billingMode: BillingMode;
  accounts: Array<{
    key: string;
    name: string;
    items: Array<{ id: string; name: string; qty: number; unitPrice: number; status?: string }>;
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
  constructor(private readonly http: HttpClient) {}

  openOrder(body: OpenOrderRequest): Observable<OpenOrderResponse> {
    return this.http.post<OpenOrderResponse>(`${environment.apiBaseUrl}/orders/open`, body);
  }

  addItem(orderId: string, body: AddItemRequest): Observable<unknown> {
    return this.http.post(`${environment.apiBaseUrl}/orders/${orderId}/items`, body);
  }

  pay(orderId: string, body: PayRequest): Observable<unknown> {
    return this.http.post(`${environment.apiBaseUrl}/orders/${orderId}/pay`, body);
  }

  getOrderByTable(tableId: number, status?: string): Observable<GetOrderByTableResponse> {
    const params = status ? { status } : undefined;
    return this.http.get<GetOrderByTableResponse>(`${environment.apiBaseUrl}/orders/by-table/${tableId}`, { params });
  }

  listOrders(status?: string): Observable<ListOrdersResponse> {
    const params = status ? { status } : undefined;
    return this.http.get<ListOrdersResponse>(`${environment.apiBaseUrl}/orders`, { params });
  }

  setOrderStatus(orderId: string, status: 'open' | 'paid' | 'cleaning' | 'closed'): Observable<unknown> {
    return this.http.patch(`${environment.apiBaseUrl}/orders/${orderId}/status`, { status });
  }
}

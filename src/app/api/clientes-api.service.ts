import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SettingsService } from '../settings/settings.service';

export interface ClienteDto {
  id: string;
  name: string;
}

export interface ListClientesResponse {
  clientes: ClienteDto[];
}

@Injectable({ providedIn: 'root' })
export class ClientesApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly settings: SettingsService,
  ) {}

  listClientes(opts?: { q?: string; take?: number }): Observable<ListClientesResponse> {
    let params = new HttpParams();
    if (opts?.q) params = params.set('q', opts.q);
    if (typeof opts?.take === 'number') params = params.set('take', String(opts.take));
    return this.http.get<ListClientesResponse>(`${this.settings.apiBaseUrl()}/clientes`, { params });
  }
}


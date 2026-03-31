import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SettingsService } from '../settings/settings.service';

export interface AuxCArticuloDto {
  CA_ID: string;
  CA_Desc: string | null;
  CA_Status: boolean;
  Date_Action?: string | Date | null;
  Action?: string | null;
  User_Action?: string | null;
}

export interface MaintInventarioDto {
  Art_ID: string;
  Art_Desc: string;
  Art_Status: boolean;
  CAT: string | null;
  Photo?: string | null;
  price: number;
}

export interface ListCategoriasResponse {
  items: AuxCArticuloDto[];
  take: number;
  skip: number;
}

export interface ListProductosResponse {
  items: MaintInventarioDto[];
  take: number;
  skip: number;
}

@Injectable({ providedIn: 'root' })
export class ArticulosApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly settings: SettingsService,
  ) {}

  listCategorias(opts?: {
    q?: string;
    status?: boolean;
    take?: number;
    skip?: number;
  }): Observable<ListCategoriasResponse> {
    let params = new HttpParams();
    if (opts?.q) params = params.set('q', opts.q);
    if (typeof opts?.status === 'boolean') params = params.set('status', String(opts.status));
    if (typeof opts?.take === 'number') params = params.set('take', String(opts.take));
    if (typeof opts?.skip === 'number') params = params.set('skip', String(opts.skip));

    return this.http.get<ListCategoriasResponse>(`${this.settings.apiBaseUrl()}/articulos`, { params });
  }

  listProductos(opts?: {
    cat?: string;
    q?: string;
    moneda?: string;
    nprecio?: string;
    status?: boolean;
    take?: number;
    skip?: number;
  }): Observable<ListProductosResponse> {
    let params = new HttpParams();
    if (opts?.cat) params = params.set('cat', opts.cat);
    if (opts?.q) params = params.set('q', opts.q);
    if (opts?.moneda) params = params.set('moneda', opts.moneda);
    if (opts?.nprecio) params = params.set('nprecio', opts.nprecio);
    if (typeof opts?.status === 'boolean') params = params.set('status', String(opts.status));
    if (typeof opts?.take === 'number') params = params.set('take', String(opts.take));
    if (typeof opts?.skip === 'number') params = params.set('skip', String(opts.skip));

    return this.http.get<ListProductosResponse>(`${this.settings.apiBaseUrl()}/productos`, { params });
  }
}

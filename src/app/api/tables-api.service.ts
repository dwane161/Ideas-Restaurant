import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SettingsService } from '../settings/settings.service';

export interface AppTableDto {
  id: number;
  seats: number;
  section: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ListTablesResponse {
  tables: AppTableDto[];
}

@Injectable({ providedIn: 'root' })
export class TablesApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly settings: SettingsService,
  ) {}

  listTables(active = true): Observable<ListTablesResponse> {
    return this.http.get<ListTablesResponse>(`${this.settings.apiBaseUrl()}/tables`, {
      params: { active: String(active) },
    });
  }
}


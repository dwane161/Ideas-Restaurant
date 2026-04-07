import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '../settings/settings.service';

export interface BusinessInfo {
  id: string;
  name: string | null;
  rnc: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

@Injectable({ providedIn: 'root' })
export class BusinessApiService {
  private cache: BusinessInfo | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly settings: SettingsService,
  ) {}

  async getBusiness(): Promise<BusinessInfo | null> {
    if (this.cache) return this.cache;

    const res = await firstValueFrom(
      this.http.get<{ business: BusinessInfo | null }>(`${this.settings.apiBaseUrl()}/business`),
    );

    this.cache = res?.business ?? null;
    return this.cache;
  }

  clearCache(): void {
    this.cache = null;
  }
}


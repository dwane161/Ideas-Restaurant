import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { DiningTablesService } from '../tab1/dining-tables.service';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: false,
})
export class Tab3Page {
  readonly apiBaseUrl = environment.apiBaseUrl;
  readonly user = this.auth.user;

  readonly apiStatus = signal<string>('—');
  readonly dbStatus = signal<string>('—');
  readonly isTesting = signal(false);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly toastController: ToastController,
    private readonly tablesService: DiningTablesService,
  ) {}

  async testConnections(): Promise<void> {
    if (this.isTesting()) return;
    this.isTesting.set(true);
    this.apiStatus.set('Probando...');
    this.dbStatus.set('Probando...');

    try {
      const health = await firstValueFrom(
        this.http.get<{ ok: boolean; time: string }>(`${this.apiBaseUrl}/health`),
      );
      this.apiStatus.set(health?.ok ? `OK (${health.time})` : 'Error');
    } catch {
      this.apiStatus.set('Error');
    }

    try {
      const ping = await firstValueFrom(
        this.http.get<{ ok: boolean }>(`${this.apiBaseUrl}/db/ping`),
      );
      this.dbStatus.set(ping?.ok ? 'OK' : 'Error');
    } catch {
      this.dbStatus.set('Error');
    }

    this.isTesting.set(false);
  }

  refreshDashboard(): void {
    this.tablesService.refreshOrdersFromBackend();
  }

  async logout(): Promise<void> {
    this.auth.logout();
    const toast = await this.toastController.create({
      message: 'Sesión cerrada',
      duration: 1200,
      color: 'medium',
      position: 'top',
    });
    await toast.present();
    await this.router.navigate(['/login'], { replaceUrl: true });
  }

}

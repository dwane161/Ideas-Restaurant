import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { DiningTablesService } from '../tab1/dining-tables.service';
import { ClientesApiService, type ClienteDto } from '../api/clientes-api.service';
import { SettingsService } from '../settings/settings.service';
import { getPrinterDiagnostics } from '../printing/printer-diag';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: false,
})
export class Tab3Page {
  readonly settings = this.settingsService.settings;
  readonly user = this.auth.user;
  readonly isRemoteLoading = this.settingsService.isRemoteLoading;
  readonly remoteError = this.settingsService.remoteError;

  readonly apiStatus = signal<string>('—');
  readonly dbStatus = signal<string>('—');
  readonly isTesting = signal(false);

  readonly imagesBaseUrlInput = signal<string>('');
  readonly imagesFolderInput = signal<string>('');
  readonly backendDbServerInput = signal<string>('');
  readonly backendDbDatabaseInput = signal<string>('');
  readonly backendDbUserInput = signal<string>('');

  readonly clientQuery = signal<string>('');
  readonly clients = signal<ClienteDto[]>([]);
  readonly isClientsLoading = signal(false);

  readonly printerDiagnostics = signal<string>('');

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly alertController: AlertController,
    private readonly toastController: ToastController,
    private readonly tablesService: DiningTablesService,
    private readonly clientesApi: ClientesApiService,
    private readonly settingsService: SettingsService,
  ) {}

  async ionViewDidEnter(): Promise<void> {
    await this.settingsService.refreshRemote();
    this.syncInputsFromSettings();
  }

  get apiBaseUrl(): string {
    return this.settings().apiBaseUrl;
  }

  private syncInputsFromSettings(): void {
    const s = this.settings();
    this.imagesBaseUrlInput.set(s.imagesBaseUrl ?? '');
    this.imagesFolderInput.set(s.imagesFolder ?? '');
    this.backendDbServerInput.set(s.backendDbServer ?? '');
    this.backendDbDatabaseInput.set(s.backendDbDatabase ?? '');
    this.backendDbUserInput.set(s.backendDbUser ?? '');
  }

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

  async loadPrinterDiagnostics(): Promise<void> {
    const data = await getPrinterDiagnostics();
    if (!data) {
      const toast = await this.toastController.create({
        message: 'Diagnóstico solo disponible en Android (APK instalada).',
        duration: 1600,
        color: 'warning',
        position: 'top',
      });
      await toast.present();
      return;
    }
    this.printerDiagnostics.set(JSON.stringify(data, null, 2));
  }

  setApiBaseUrl(value: unknown): void {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    this.settingsService.setApiBaseUrl(raw);
  }

  setImagesBaseUrl(value: unknown): void {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    this.imagesBaseUrlInput.set(raw);
  }

  setImagesFolder(value: unknown): void {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    this.imagesFolderInput.set(raw);
  }

  setBackendDbServer(value: unknown): void {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    this.backendDbServerInput.set(raw);
  }

  setBackendDbDatabase(value: unknown): void {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    this.backendDbDatabaseInput.set(raw);
  }

  setBackendDbUser(value: unknown): void {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    this.backendDbUserInput.set(raw);
  }

  async saveImagesConfig(): Promise<void> {
    try {
      await this.settingsService.setImagesConfig({
        baseUrl: this.imagesBaseUrlInput().trim(),
        folder: this.imagesFolderInput().trim(),
      });
    } catch {
      const toast = await this.toastController.create({
        message: 'No se pudo guardar la configuración de imágenes',
        duration: 1400,
        color: 'danger',
        position: 'top',
      });
      await toast.present();
      return;
    }
    const toast = await this.toastController.create({
      message: 'Configuración de imágenes guardada',
      duration: 1200,
      color: 'success',
      position: 'top',
    });
    await toast.present();
  }

  async saveBackendDbConfig(): Promise<void> {
    try {
      await this.settingsService.setBackendDbConfig({
        server: this.backendDbServerInput().trim(),
        database: this.backendDbDatabaseInput().trim(),
        user: this.backendDbUserInput().trim(),
      });
    } catch {
      const toast = await this.toastController.create({
        message: 'No se pudo guardar la configuración de BD',
        duration: 1400,
        color: 'danger',
        position: 'top',
      });
      await toast.present();
      return;
    }
    const toast = await this.toastController.create({
      message: 'Configuración de BD guardada',
      duration: 1200,
      color: 'success',
      position: 'top',
    });
    await toast.present();
  }

  setClientQuery(value: unknown): void {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    this.clientQuery.set(raw);
  }

  searchClientes(): void {
    if (this.isClientsLoading()) return;
    const q = this.clientQuery().trim();
    this.isClientsLoading.set(true);
    this.clientesApi.listClientes({ q, take: 50 }).subscribe({
      next: (res) => {
        this.clients.set(res?.clientes ?? []);
        this.isClientsLoading.set(false);
      },
      error: () => {
        this.clients.set([]);
        this.isClientsLoading.set(false);
      }
    });
  }

  async setDefaultClient(c: ClienteDto): Promise<void> {
    const confirm = await this.alertController.create({
      header: 'Cliente por defecto',
      message: `¿Usar "${c.name}" como cliente por defecto?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Sí', role: 'confirm' }
      ]
    });
    await confirm.present();
    const result = await confirm.onDidDismiss();
    if (result.role !== 'confirm') return;

    try {
      await this.settingsService.setDefaultClient({ id: c.id, name: c.name });
    } catch {
      const toast = await this.toastController.create({
        message: 'No se pudo guardar el cliente por defecto',
        duration: 1400,
        color: 'danger',
        position: 'top',
      });
      await toast.present();
      return;
    }

    const toast = await this.toastController.create({
      message: 'Cliente por defecto actualizado',
      duration: 1200,
      color: 'success',
      position: 'top'
    });
    await toast.present();
  }

  async clearDefaultClient(): Promise<void> {
    try {
      await this.settingsService.setDefaultClient(null);
    } catch {
      const toast = await this.toastController.create({
        message: 'No se pudo eliminar el cliente por defecto',
        duration: 1400,
        color: 'danger',
        position: 'top',
      });
      await toast.present();
      return;
    }
    const toast = await this.toastController.create({
      message: 'Cliente por defecto eliminado',
      duration: 1200,
      color: 'medium',
      position: 'top'
    });
    await toast.present();
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

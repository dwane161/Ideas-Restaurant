import { Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { NotificationsService } from './notifications.service';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private lastToastAt = 0;

  constructor(
    private readonly toastController: ToastController,
    private readonly notifications: NotificationsService,
  ) {}

  async dishCompleted(input: { message: string; tableId?: number | null }): Promise<void> {
    this.notifications.add('dish_completed', input.message, { tableId: input.tableId ?? null });

    const now = Date.now();
    // Basic debounce to avoid spamming.
    if (now - this.lastToastAt < 400) return;
    this.lastToastAt = now;

    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch {
      // ignore
    }

    const toast = await this.toastController.create({
      message: input.message,
      duration: 1600,
      color: 'success',
      position: 'top',
    });
    await toast.present();
  }

  async tableCompleted(input: { message: string; tableId?: number | null }): Promise<void> {
    this.notifications.add('table_completed', input.message, { tableId: input.tableId ?? null });

    const now = Date.now();
    // Basic debounce to avoid spamming.
    if (now - this.lastToastAt < 400) return;
    this.lastToastAt = now;

    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch {
      // ignore
    }

    const toast = await this.toastController.create({
      message: input.message,
      duration: 2000,
      color: 'primary',
      position: 'top',
    });
    await toast.present();
  }
}

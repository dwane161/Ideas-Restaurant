import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [IonicModule],
  standalone: true
})
export class LoginPage implements OnInit {
  ngOnInit(): void {
    if (this.auth.user()) {
      void this.router.navigate(['/tabs/tab1'], { replaceUrl: true });
    }
  }

  maxPin = 4;

  pin = signal<string[]>([]);
  errorMessage = signal<string>('');

  dots = Array(this.maxPin);

  keys = [
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },

    { label: '4', value: '4' },
    { label: '5', value: '5' },
    { label: '6', value: '6' },

    { label: '7', value: '7' },
    { label: '8', value: '8' },
    { label: '9', value: '9' },

    { label: '👤', action: 'user' },
    { label: '0', value: '0' },
    { label: '⌫', action: 'delete' },
  ];

  onKeyPress(key: any) {
    if (key.value) {
      this.addDigit(key.value);
    } else if (key.action === 'delete') {
      this.removeDigit();
    }
  }

  constructor(
    private readonly router: Router,
    private readonly toastController: ToastController,
    private readonly auth: AuthService,
  ) {}

  addDigit(value: string) {
    if (this.pin().length >= this.maxPin) return;

    const next = [...this.pin(), value];
    this.pin.set(next);
    if (this.errorMessage()) this.errorMessage.set('');
    if (next.length === this.maxPin) {
      setTimeout(() => void this.submit(), 0);
    }
  }

  removeDigit() {
    this.pin.update((p: string[]) => p.slice(0, -1));
    if (this.errorMessage()) this.errorMessage.set('');
  }

  async submit() {
    if (this.pin().length !== this.maxPin) {
      this.errorMessage.set('PIN incompleto');
      const toast = await this.toastController.create({
        message: 'PIN incompleto',
        duration: 1200,
        color: 'medium',
        position: 'top',
      });
      await toast.present();
      return;
    }

    const pinValue = this.pin().join('');
    this.auth.loginWithPin(pinValue).subscribe({
      next: async () => {
        this.pin.set([]);
        this.errorMessage.set('');
        await this.router.navigate(['/tabs/tab1'], { replaceUrl: true });
      },
      error: async () => {
        this.pin.set([]);
        this.errorMessage.set('PIN incorrecto');
        const toast = await this.toastController.create({
          message: 'PIN incorrecto',
          duration: 1300,
          color: 'danger',
          position: 'top',
        });
        await toast.present();
      },
    });
  }
}

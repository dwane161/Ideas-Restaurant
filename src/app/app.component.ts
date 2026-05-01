import { Component } from '@angular/core';
import { AppUpdateService } from './update/app-update.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  constructor(private readonly appUpdate: AppUpdateService) {
    this.appUpdate.start();
  }
}

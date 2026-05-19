import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { TablesPage } from './tables.page';

describe('TablesPage', () => {
  let component: TablesPage;
  let fixture: ComponentFixture<TablesPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TablesPage],
      imports: [IonicModule.forRoot(), ExploreContainerComponentModule]
    }).compileComponents();

    fixture = TestBed.createComponent(TablesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

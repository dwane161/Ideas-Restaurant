import { Component, computed, signal } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import {
  DiningTablesService,
  type AccountOrder,
  type DiningTable,
  type TableOrder,
} from '../tab1/dining-tables.service';
import {
  ArticulosApiService,
  type AuxCArticuloDto,
  type MaintInventarioDto,
} from '../api/articulos-api.service';
import { AuthService } from '../auth/auth.service';

type MenuCategoryId = string;

interface MenuCategory {
  id: MenuCategoryId;
  label: string;
  subtitle: string;
}

interface MenuDish {
  id: string;
  categoryId: MenuCategoryId;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  popular?: boolean;
  buttonVariant?: 'primary' | 'accent';
}

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: false,
})
export class Tab2Page {
  private readonly fallbackImageUrl = 'assets/dish-placeholder.svg';
  private readonly brokenImageDishIds = new Set<string>();

  readonly selectedTable = this.tablesService.selectedTable;
  readonly occupiedTables = this.tablesService.occupiedTables;
  readonly selectedOrder = this.tablesService.selectedOrder;

  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly searchTerm = signal('');

  private readonly categorias = signal<AuxCArticuloDto[]>([]);
  private readonly productos = signal<MaintInventarioDto[]>([]);

  readonly isAddModalOpen = signal(false);
  readonly pendingDishId = signal<string | null>(null);
  readonly selectedAccountIdForAdd = signal<string | null>(null);
  readonly noteForAdd = signal<string>('');

  selectedCategoryId: MenuCategoryId = 'all';

  private readonly dishes = signal<MenuDish[]>([]);

  readonly categories = computed<MenuCategory[]>(() => {
    const cats = this.categorias();
    return [
      { id: 'all', label: 'Todos', subtitle: `${this.productos().length} producto(s)` },
      ...cats.map((c) => ({
        id: c.CA_ID,
        label: c.CA_Desc?.trim() || c.CA_ID,
        subtitle: c.CA_ID,
      })),
    ];
  });

  readonly pendingDish = computed(() => {
    const id = this.pendingDishId();
    return id ? this.dishes().find((d) => d.id === id) : undefined;
  });

  readonly accountsForSelectedTable = computed<AccountOrder[]>(() => {
    const table = this.selectedTable();
    if (!table || table.status !== 'occupied') return [];
    const order = this.tablesService.getOrder(table.id);
    return order?.accounts ?? [];
  });

  readonly selectedTableLabelForAdd = computed(() => {
    const table = this.selectedTable();
    if (!table || table.status !== 'occupied') {
      return 'Selecciona una mesa ocupada desde el dashboard.';
    }
    return this.formatTableLabel(table);
  });

  constructor(
    private readonly tablesService: DiningTablesService,
    private readonly toastController: ToastController,
    private readonly alertController: AlertController,
    private readonly articulosApi: ArticulosApiService,
    private readonly auth: AuthService,
  ) {}

  readonly user = this.auth.user;

  ionViewDidEnter(): void {
    if (this.dishes().length > 0 || this.isLoading()) return;
    this.loadCategorias();
  }

  get selectedCategory(): MenuCategory {
    return (
      this.categories().find((c) => c.id === this.selectedCategoryId) ??
      this.categories()[0]
    );
  }

  get filteredDishes(): MenuDish[] {
    const term = this.searchTerm().trim().toLowerCase();

    return this.dishes().filter((d) => {
      const matchesCategory =
        this.selectedCategoryId === 'all' || d.categoryId === this.selectedCategoryId;

      const matchesSearch =
        !term ||
        d.name.toLowerCase().includes(term) ||
        d.id.toLowerCase().includes(term) ||
        d.description.toLowerCase().includes(term);

      return matchesCategory && matchesSearch;
    });
  }

  selectCategory(categoryId: MenuCategoryId): void {
    this.selectedCategoryId = categoryId;
    this.loadProductosForSelectedCategory();
  }

  addToOrder(dish: MenuDish): void {
    const selected = this.selectedTable();
    if (!selected || selected.status !== 'occupied') {
      void this.toastController
        .create({
          message: 'Abre/selecciona una mesa ocupada para añadir productos.',
          duration: 1800,
          color: 'warning',
          position: 'top',
        })
        .then((t) => t.present());
      return;
    }

    const order = this.tablesService.getOrder(selected.id);
    const accounts = order?.accounts ?? [];

    // Always show the same "add" UI so the comment can be entered there (even for single-account orders).
    this.pendingDishId.set(dish.id);
    this.selectedAccountIdForAdd.set(accounts.length > 0 ? accounts[0].id : null);
    this.noteForAdd.set('');
    this.isAddModalOpen.set(true);
  }

  getDishImageUrl(dish: MenuDish): string {
    return this.brokenImageDishIds.has(dish.id)
      ? this.fallbackImageUrl
      : dish.imageUrl;
  }

  onDishImageError(dish: MenuDish): void {
    this.brokenImageDishIds.add(dish.id);
  }

  formatTableLabel(table: DiningTable): string {
    return `Mesa ${String(table.id).padStart(2, '0')}`;
  }

  closeAddModal(): void {
    this.isAddModalOpen.set(false);
    this.pendingDishId.set(null);
    this.selectedAccountIdForAdd.set(null);
    this.noteForAdd.set('');
  }

  async confirmAddToOrder(): Promise<void> {
    const dish = this.pendingDish();
    const accountId = this.selectedAccountIdForAdd();

    const table = this.selectedTable();
    if (!dish || !table || table.status !== 'occupied') return;
    const resolvedTableId = table.id;

    const order: TableOrder | undefined = this.tablesService.getOrder(resolvedTableId);
    const accounts = order?.accounts ?? [];
    const resolvedAccountId = accountId ?? accounts[0]?.id ?? 'A';
    const resolvedAccountName =
      accounts.find((a) => a.id === resolvedAccountId)?.name ?? undefined;
    const isShared = accounts.length > 1;
    const note = this.noteForAdd().trim();

    this.tablesService.selectTable(resolvedTableId);
    this.tablesService.addItemToOrder(
      resolvedTableId,
      resolvedAccountId,
      { id: dish.id, name: dish.name, unitPrice: dish.price, note: note || null },
      1,
    );

    this.closeAddModal();

    const toast = await this.toastController.create({
      message: this.buildAddedMessage(
        dish.name,
        resolvedTableId,
        isShared ? resolvedAccountName : undefined,
      ),
      duration: 1600,
      color: 'success',
      position: 'top',
    });
    await toast.present();
  }

  setAccountIdForAdd(value: unknown): void {
    const id = typeof value === 'string' ? value : String(value ?? '');
    this.selectedAccountIdForAdd.set(id ? id : null);
  }

  setNoteForAdd(value: unknown): void {
    this.noteForAdd.set(typeof value === 'string' ? value : String(value ?? ''));
  }

  trackDishById(_: number, dish: MenuDish): string {
    return dish.id;
  }

  trackTableById(_: number, table: DiningTable): number {
    return table.id;
  }

  setSearchTerm(value: unknown): void {
    this.searchTerm.set(typeof value === 'string' ? value : String(value ?? ''));
  }

  refreshArticulos(): void {
    this.loadCategorias();
  }

  handleRefresh(event: Event): void {
    const refresher = event?.target as { complete?: () => void } | null;
    this.loadCategorias(() => refresher?.complete?.());
  }

  private loadCategorias(onDone?: () => void): void {
    this.isLoading.set(true);
    this.loadError.set(null);

    this.articulosApi.listCategorias({ status: true, take: 200, skip: 0 }).subscribe({
      next: (res) => {
        this.categorias.set(res.items ?? []);
        this.loadProductosForSelectedCategory();
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'No se pudo cargar el menú.';
        this.loadError.set(message);
        this.isLoading.set(false);
        onDone?.();
      },
      complete: () => {
        // `loadProductosForSelectedCategory` gestiona el loading al finalizar.
        onDone?.();
      },
    });
  }

  private loadProductosForSelectedCategory(): void {
    const cat = this.selectedCategoryId !== 'all' ? this.selectedCategoryId : undefined;
    this.isLoading.set(true);
    this.loadError.set(null);

    this.articulosApi.listProductos({ status: true, take: 200, skip: 0, cat }).subscribe({
      next: (res) => {
        this.productos.set(res.items ?? []);
        this.dishes.set((res.items ?? []).map((p) => this.toMenuDish(p)));
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'No se pudo cargar el menú.';
        this.loadError.set(message);
      },
      complete: () => {
        this.isLoading.set(false);

        if (!this.categories().some((c) => c.id === this.selectedCategoryId)) {
          this.selectedCategoryId = 'all';
        }
      },
    });
  }

  private toMenuDish(p: MaintInventarioDto): MenuDish {
    const id = p.Art_ID;
    const name = (p.Art_Desc ?? '').trim() || id;
    const categoryId = (p.CAT ?? '').trim() || 'Sin categoría';

    return {
      id,
      categoryId,
      name,
      description: `Código: ${id}`,
      price: typeof p.price === 'number' && Number.isFinite(p.price) ? p.price : 0,
      imageUrl: this.fallbackImageUrl,
      buttonVariant: 'primary',
    };
  }

  private buildAddedMessage(dishName: string, tableId: number, accountName?: string): string {
    const tableLabel = `Mesa ${String(tableId).padStart(2, '0')}`;
    if (accountName && accountName.trim()) {
      return `Agregado: ${dishName} → ${tableLabel} (${accountName})`;
    }
    return `Agregado: ${dishName} → ${tableLabel}`;
  }
}

import type { IFnbMenu, IMenuCategory, IMenuDish, IMenuTopping, IMenuVariant, IQuickNote } from 'src/types/fnb';

// ----------------------------------------------------------------------
// Thực đơn trên máy (contract 3.1): một gói cho chi nhánh, app tự lọc theo nhóm / tên. Sắp xếp theo `sortOrder`
// rồi tên. Hết món theo chi nhánh: cả món, một size hoặc một món thêm.
// ----------------------------------------------------------------------

const bySortThenName = <T extends { sortOrder: number }>(name: (x: T) => string) => (a: T, b: T) =>
  a.sortOrder - b.sortOrder || name(a).localeCompare(name(b), 'vi');

/** Bỏ dấu tiếng Việt, chữ thường — để tìm "ca phe" ra "Cà phê". */
export function normalizeVi(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Nhóm món theo thứ tự hiển thị (máy chủ chỉ trả nhóm có món + nhóm cha của chúng). */
export function sortedCategories(menu: IFnbMenu | null | undefined): IMenuCategory[] {
  return [...(menu?.categories ?? [])].sort(bySortThenName((c) => c.name));
}

/** Id nhóm `categoryId` và mọi nhóm con cháu của nó. */
function categoryWithDescendants(menu: IFnbMenu, categoryId: string): Set<string> {
  const ids = new Set([categoryId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of menu.categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Món theo nhóm (kể cả nhóm con) và từ khoá (tên hoặc mã, không dấu). */
export function filterDishes(menu: IFnbMenu | null | undefined, opts: { categoryId?: string | null; keyword?: string } = {}): IMenuDish[] {
  if (!menu) return [];
  const cats = opts.categoryId ? categoryWithDescendants(menu, opts.categoryId) : null;
  const kw = normalizeVi(opts.keyword ?? '');
  return menu.dishes
    .filter((d) => (!cats || cats.has(d.categoryId)) && (!kw || normalizeVi(d.name).includes(kw) || normalizeVi(d.code).includes(kw)))
    .sort(bySortThenName((d) => d.name));
}

export function sortedVariants(dish: IMenuDish): IMenuVariant[] {
  return [...dish.variants].sort(bySortThenName((v) => v.name ?? ''));
}

export const variantSoldOut = (dish: IMenuDish, v: IMenuVariant) => dish.isSoldOut || v.isSoldOut;

/** Size mặc định: size đầu tiên còn bán; hết cả thì null. */
export function defaultVariant(dish: IMenuDish): IMenuVariant | null {
  return sortedVariants(dish).find((v) => !variantSoldOut(dish, v)) ?? null;
}

/** Món thêm được phép của món, theo thứ tự của món (chỉ những món thêm đang có trên thực đơn). */
export function allowedToppings(menu: IFnbMenu | null | undefined, dish: IMenuDish): IMenuTopping[] {
  if (!menu) return [];
  const byId = new Map(menu.toppings.map((t) => [t.productId, t]));
  return dish.toppingIds.map((id) => byId.get(id)).filter((t): t is IMenuTopping => !!t);
}

/** Ghi chú nhanh dùng được cho món: `categoryIds` rỗng = mọi món; còn lại theo nhóm của món hoặc nhóm cha. */
export function quickNotesFor(menu: IFnbMenu | null | undefined, dish: IMenuDish | null): IQuickNote[] {
  if (!menu) return [];
  const ancestors = new Set<string>();
  if (dish) {
    const parent = new Map(menu.categories.map((c) => [c.id, c.parentId]));
    let id: string | null | undefined = dish.categoryId;
    while (id && !ancestors.has(id)) {
      ancestors.add(id);
      id = parent.get(id);
    }
  }
  return menu.quickNotes
    .filter((n) => n.categoryIds.length === 0 || n.categoryIds.some((c) => ancestors.has(c)))
    .sort(bySortThenName((n) => n.text));
}

/** Bấm món mở bảng tuỳ chọn khi có nhiều size hoặc có món thêm; còn lại thêm thẳng. */
export function dishNeedsOptions(menu: IFnbMenu | null | undefined, dish: IMenuDish): boolean {
  return dish.variants.length > 1 || allowedToppings(menu, dish).length > 0;
}

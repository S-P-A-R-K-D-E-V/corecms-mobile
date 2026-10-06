import type { ICategory } from 'src/types/erp';

// ----------------------------------------------------------------------
// Hàng chip lọc theo nhóm hàng ở khung chọn hàng. Nhóm lấy từ GET /categories; lọc do core-be làm
// (GET /products?categoryId=…, đúng nhóm được chọn — không gộp hàng của nhóm con), app không tự lọc trên trang
// đã tải vì danh sách hàng tải theo trang.
// ----------------------------------------------------------------------

export type PosCategory = { id: string; name: string };

/**
 * Nhóm hàng để hiện thành chip: chỉ nhóm đang dùng, mỗi nhóm một lần, nhóm con đứng ngay sau nhóm cha (giữ thứ
 * tự API trả trong từng cấp). API trả danh sách phẳng nhưng từng nhóm có thể kèm sẵn `subCategories` → gom hết
 * rồi bỏ trùng theo id. Nhóm cha đã ẩn thì nhóm con còn dùng vẫn hiện (như một nhóm gốc).
 */
export function posCategories(list: readonly ICategory[] | null | undefined): PosCategory[] {
  const byId = new Map<string, ICategory>();
  const collect = (items: readonly ICategory[] | null | undefined) => {
    for (const c of items ?? []) {
      if (!c || typeof c.id !== 'string' || !c.id) continue;
      if (!byId.has(c.id)) byId.set(c.id, c);
      collect(c.subCategories);
    }
  };
  collect(list);

  const active = [...byId.values()].filter((c) => c.isActive !== false && !!c.name?.trim());
  const activeIds = new Set(active.map((c) => c.id));
  const childrenOf = new Map<string, ICategory[]>();
  const roots: ICategory[] = [];
  for (const c of active) {
    const parent = c.parentCategoryId;
    if (parent && parent !== c.id && activeIds.has(parent)) {
      const siblings = childrenOf.get(parent);
      if (siblings) siblings.push(c);
      else childrenOf.set(parent, [c]);
    } else {
      roots.push(c);
    }
  }

  const out: PosCategory[] = [];
  const seen = new Set<string>();
  const visit = (c: ICategory) => {
    if (seen.has(c.id)) return; // dữ liệu vòng (cha ↔ con) không làm lặp vô hạn
    seen.add(c.id);
    out.push({ id: c.id, name: c.name.trim() });
    for (const child of childrenOf.get(c.id) ?? []) visit(child);
  };
  roots.forEach(visit);
  // Nhóm chỉ nằm trong một vòng cha ↔ con (không có gốc) vẫn phải hiện.
  active.forEach(visit);
  return out;
}

/** Từ 2 nhóm trở lên mới có gì để lọc. */
export const hasCategoryFilter = (categories: readonly PosCategory[]) => categories.length >= 2;

/** Nhóm đang lọc: nhóm đã chọn không còn trong danh sách (bị ẩn / xoá) → bỏ lọc, hiện tất cả. */
export function activeCategoryId(selected: string | null | undefined, categories: readonly PosCategory[]): string | null {
  return selected && categories.some((c) => c.id === selected) ? selected : null;
}

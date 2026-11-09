import type { AuthUser } from 'src/auth/auth-context';
import { PERMISSIONS, hasPermission } from 'src/auth/permissions';
import type { ImagePreset } from 'src/api/productImages';

// ----------------------------------------------------------------------
// Bộ ảnh sản phẩm: thao tác thuần trên mảng URL (ảnh đầu = ảnh chính) + quyền vào màn ảnh sản phẩm.
// ----------------------------------------------------------------------

export const MAX_PRODUCT_IMAGES = 12;
export const MAX_IMAGE_TAGS = 6;

/** Sửa ảnh sản phẩm: cần products.update, không mở ở máy quầy (server cũng chặn). */
export function canEditProductImages(user: AuthUser | null | undefined, counterSession: boolean): boolean {
  return !counterSession && hasPermission(user, PERMISSIONS.products.update);
}

export function makePrimary(urls: string[], url: string): string[] {
  if (!urls.includes(url)) return urls;
  return [url, ...urls.filter((u) => u !== url)];
}

export function move(urls: string[], url: string, delta: -1 | 1): string[] {
  const from = urls.indexOf(url);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= urls.length) return urls;
  const next = [...urls];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export function remove(urls: string[], url: string): string[] {
  return urls.filter((u) => u !== url);
}

/** Thêm vào cuối, bỏ trùng, tối đa {@link MAX_PRODUCT_IMAGES}. */
export function append(urls: string[], added: string[]): { urls: string[]; dropped: number } {
  const next = [...urls];
  let dropped = 0;
  for (const u of added) {
    if (next.includes(u)) continue;
    if (next.length >= MAX_PRODUCT_IMAGES) dropped += 1;
    else next.push(u);
  }
  return { urls: next, dropped };
}

export function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((u, i) => u === b[i]);
}

export function toggleTag(selected: string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((t) => t !== id);
  if (selected.length >= MAX_IMAGE_TAGS) return selected;
  return [...selected, id];
}

/** Gợi ý mặc định: cách dùng đầu tiên (ảnh thực tế) nếu có, không thì gợi ý đầu. */
export function defaultPreset(presets: ImagePreset[]): string | null {
  return presets.find((p) => p.group === 'lifestyle')?.id ?? presets[0]?.id ?? null;
}

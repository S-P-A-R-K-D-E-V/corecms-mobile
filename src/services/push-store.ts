// ----------------------------------------------------------------------
// Thông báo đẩy theo cửa hàng — phần thuần (test được).
// Server lưu token Expo theo cửa hàng ĐANG đăng nhập (POST /notifications/push-token gọi tới API của cửa hàng đó)
// và gửi kèm trong data: tenantId, storeCode, storeName. Máy chỉ gắn MỘT cửa hàng mỗi lúc (store-config) và huỷ
// đăng ký ở cửa hàng cũ trước khi rời nó; push của cửa hàng khác vẫn có thể tới khi chưa huỷ được (mất phiên —
// server đã từ chối token nên không gọi huỷ được, mất mạng lúc đăng xuất):
//   - chạm vào → KHÔNG mở theo link, báo đây là thông báo của cửa hàng nào;
//   - tới lúc đang mở app → hiện lại với tên cửa hàng đứng trước tiêu đề.
// Push cũ chưa có các trường này, hoặc app chưa gắn cửa hàng (bản CiCi) → coi như cùng cửa hàng (tương thích ngược).
// ----------------------------------------------------------------------

export type PushData = {
  category: string | null;
  conversationId: string | null;
  tenantId: string | null;
  /** Mã cửa hàng, chữ thường (so với StoreProfile.code). */
  storeCode: string | null;
  storeName: string | null;
};

/** Đánh dấu bản hiện lại (đã có tên cửa hàng) để handler không hiện lại lần nữa. */
export const STORE_REPOST_FLAG = '_storeRepost';

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** data của thông báo: object, hoặc chuỗi JSON (một số đường gửi Android). Không đọc được → {}. */
export function pushDataRecord(data: unknown): Record<string, unknown> {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Đọc trường theo tên camelCase, chấp nhận cả PascalCase (server .NET serialize không đổi tên). */
function field(d: Record<string, unknown>, name: string): string | null {
  return text(d[name]) ?? text(d[name.charAt(0).toUpperCase() + name.slice(1)]);
}

export function parsePushData(data: unknown): PushData {
  const d = pushDataRecord(data);
  return {
    category: field(d, 'category') ?? field(d, 'type'),
    conversationId: field(d, 'conversationId'),
    tenantId: field(d, 'tenantId'),
    storeCode: field(d, 'storeCode')?.toLowerCase() ?? null,
    storeName: field(d, 'storeName'),
  };
}

/** Push thuộc cửa hàng app đang gắn? Thiếu storeCode ở push hoặc app chưa gắn cửa hàng → coi như cùng cửa hàng. */
export function isSameStore(push: Pick<PushData, 'storeCode'>, currentStoreCode: string | null | undefined): boolean {
  const current = currentStoreCode?.trim().toLowerCase();
  if (!push.storeCode || !current) return true;
  return push.storeCode === current;
}

/** Tên hiển thị của cửa hàng gửi push: tên, thiếu thì mã. */
export function pushStoreLabel(push: Pick<PushData, 'storeName' | 'storeCode'>): string {
  return push.storeName ?? push.storeCode ?? '';
}

export type PushTapDecision =
  /** Cùng cửa hàng: giữ hành vi cũ (mở app). */
  | { kind: 'sameStore'; push: PushData }
  /** Cửa hàng khác: không mở theo link, báo tên cửa hàng để đăng nhập cửa hàng đó. */
  | { kind: 'otherStore'; push: PushData; storeLabel: string };

export function decidePushTap(data: unknown, currentStoreCode: string | null | undefined): PushTapDecision {
  const push = parsePushData(data);
  return isSameStore(push, currentStoreCode)
    ? { kind: 'sameStore', push }
    : { kind: 'otherStore', push, storeLabel: pushStoreLabel(push) };
}

/** "Tiệm Tóc ABC · Ca làm sắp bắt đầu"; không có tiêu đề → chỉ tên cửa hàng. */
export function storePrefixedTitle(title: string | null | undefined, storeLabel: string): string {
  const t = title?.trim();
  if (!storeLabel) return t ?? '';
  return t ? `${storeLabel} · ${t}` : storeLabel;
}

export function isStoreRepost(data: unknown): boolean {
  return pushDataRecord(data)[STORE_REPOST_FLAG] === true;
}

export type StoreRepost = { title: string; body: string | null; data: Record<string, unknown> };

/**
 * Push tới lúc đang mở app: handler của expo-notifications chỉ chọn hiện / ẩn, không sửa được nội dung → push của
 * cửa hàng khác thì ẩn bản gốc và hiện lại bản này (tiêu đề có tên cửa hàng, giữ nguyên data + cờ đã hiện lại).
 * null = cùng cửa hàng / đã là bản hiện lại → xử lý như thường.
 */
export function foreignStoreRepost(
  content: { title?: string | null; body?: string | null; data?: unknown },
  currentStoreCode: string | null | undefined
): StoreRepost | null {
  const data = pushDataRecord(content.data);
  if (data[STORE_REPOST_FLAG] === true) return null;
  const push = parsePushData(data);
  if (isSameStore(push, currentStoreCode)) return null;
  return {
    title: storePrefixedTitle(content.title, pushStoreLabel(push)),
    body: content.body ?? null,
    data: { ...data, [STORE_REPOST_FLAG]: true },
  };
}

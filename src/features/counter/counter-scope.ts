// ----------------------------------------------------------------------
// Máy quầy chỉ phục vụ bán hàng (owner chốt 2026-10-16): ai đăng nhập ở máy quầy — kể cả chủ cửa hàng / quản lý —
// cũng chỉ có bán hàng (bán lẻ + F&B), hàng hoá (xem), hoá đơn / in / trả hàng, kiểm tiền ca. Không chấm công, lịch,
// lương, tin nhắn, trợ lý hay việc quản trị. Server chặn cùng phạm vi (core-be CounterScopeMiddleware) — ở đây chỉ
// để giao diện không mở ra màn sẽ bị từ chối.
// ----------------------------------------------------------------------

/** Tiện ích (launcher registry key) dùng được ở máy quầy. */
export const COUNTER_FEATURE_KEYS: ReadonlySet<string> = new Set(['pos', 'products', 'invoices', 'shift-cash']);

/** Tiện ích chỉ dành cho quản lý trên điện thoại nhưng ở máy quầy ai cũng cần (hoá đơn để in lại / trả hàng). */
export const COUNTER_OPEN_TO_ALL: ReadonlySet<string> = new Set(['invoices']);

/** Màn bắt đầu sau khi đăng nhập ở máy quầy. */
export const COUNTER_HOME = '/(tabs)/pos';

// Đường dẫn (usePathname — không có nhóm "(tabs)") được mở ở máy quầy; còn lại đưa về Bán hàng.
const ALLOWED_PREFIXES = [
  '/pos',
  '/products',
  '/invoices',
  '/shift-cash',
  '/fnb',
  '/features',
  '/profile',
  '/settings',
  '/counter',
  '/legal',
];

export function isCounterPathAllowed(pathname: string | null | undefined): boolean {
  if (!pathname || pathname === '/') return true;
  return ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

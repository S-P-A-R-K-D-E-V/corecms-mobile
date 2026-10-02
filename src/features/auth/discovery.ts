import { create } from 'zustand';

import { discoverStores, newSsoState, type DiscoverRequest, type DiscoverResult, type DiscoveredStore } from 'src/api/app-hub';

// ----------------------------------------------------------------------
// Kết quả app-hub/discover đang chờ người dùng chọn cửa hàng. Chỉ nằm trong bộ nhớ (không lưu máy).
// Mã SSO sống 60 giây — quá hạn thì chạy discover lại với cùng thông tin đăng nhập (token Apple còn
// hạn ~10 phút; authorizationCode của Apple chỉ dùng được một lần nên bỏ ra ở lần chạy lại).
// ----------------------------------------------------------------------

/** Chừa vài giây cho mạng trước khi mã 60 giây thật sự hết hạn. */
const TICKET_TTL_MS = 50_000;
/** Không giữ thông tin đăng nhập lâu hơn thế này. */
const REQUEST_TTL_MS = 5 * 60_000;

export type SignInMethod = 'apple' | 'google' | 'email';

export type Pending = {
  state: string;
  /** null = đăng nhập qua web (mã dùng một lần) — không chạy lại được, quá hạn thì đăng nhập lại. */
  request: DiscoverRequest | null;
  via: SignInMethod;
  result: DiscoverResult;
  at: number;
  firstAt: number;
  /** Mã cửa hàng của trang đăng nhập đã mở đăng nhập này (Google từ trang của một cửa hàng) — ưu tiên vào. */
  prefer?: string | null;
};

/**
 * Đăng nhập Google/Apple hợp lệ nhưng tài khoản chưa thuộc cửa hàng nào: trang đăng nhập (Chào mừng hoặc
 * trang của cửa hàng) hiện lời nhắn thay vì sang màn chọn cửa hàng rỗng. Không giữ token/mật khẩu ở đây.
 */
export type NoStoreNotice = { email: string | null; via: SignInMethod };

type DiscoveryState = {
  pending: Pending | null;
  noStore: NoStoreNotice | null;
  clear: () => void;
  showNoStore: (notice: NoStoreNotice) => void;
  dismissNoStore: () => void;
};

export const useDiscovery = create<DiscoveryState>((set) => ({
  pending: null,
  noStore: null,
  clear: () => set({ pending: null }),
  showNoStore: (notice) => set({ pending: null, noStore: notice }),
  dismissNoStore: () => set({ noStore: null }),
}));

export async function runDiscovery(request: DiscoverRequest): Promise<Pending> {
  const state = newSsoState();
  const result = await discoverStores(state, request);
  const now = Date.now();
  const via: SignInMethod = 'provider' in request ? request.provider : 'email';
  const pending: Pending = { state, request, via, result, at: now, firstAt: now };
  useDiscovery.setState({ pending, noStore: null });
  return pending;
}

/** Kết quả đã có sẵn (đổi mã từ đăng nhập web) → chờ người dùng chọn cửa hàng như discover. */
export function setDiscovered(state: string, via: SignInMethod, result: DiscoverResult, prefer?: string | null): Pending {
  const now = Date.now();
  const pending: Pending = { state, request: null, via, result, at: now, firstAt: now, prefer: prefer ?? null };
  useDiscovery.setState({ pending, noStore: null });
  return pending;
}

/**
 * Mã SSO còn hạn cho cửa hàng `code` (chạy discover lại nếu đã quá hạn). null = không thể làm mới
 * (quá lâu, hoặc cửa hàng không còn trong danh sách) → người dùng đăng nhập lại.
 */
export async function freshTicket(code: string): Promise<{ store: DiscoveredStore; state: string } | null> {
  const pending = useDiscovery.getState().pending;
  if (!pending) return null;

  if (Date.now() - pending.at < TICKET_TTL_MS) {
    const store = pending.result.stores.find((s) => s.code === code);
    return store ? { store, state: pending.state } : null;
  }

  if (!pending.request || Date.now() - pending.firstAt > REQUEST_TTL_MS) return null;

  const request: DiscoverRequest =
    'provider' in pending.request ? { ...pending.request, authorizationCode: undefined } : pending.request;
  const state = newSsoState();
  const result = await discoverStores(state, request);
  useDiscovery.setState({ pending: { ...pending, state, request, result, at: Date.now() } });
  const store = result.stores.find((s) => s.code === code);
  return store ? { store, state } : null;
}

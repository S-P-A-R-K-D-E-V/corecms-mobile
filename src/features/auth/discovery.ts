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

type Pending = {
  state: string;
  request: DiscoverRequest;
  result: DiscoverResult;
  at: number;
  firstAt: number;
};

type DiscoveryState = {
  pending: Pending | null;
  clear: () => void;
};

export const useDiscovery = create<DiscoveryState>((set) => ({
  pending: null,
  clear: () => set({ pending: null }),
}));

export async function runDiscovery(request: DiscoverRequest): Promise<Pending> {
  const state = newSsoState();
  const result = await discoverStores(state, request);
  const now = Date.now();
  const pending: Pending = { state, request, result, at: now, firstAt: now };
  useDiscovery.setState({ pending });
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

  if (Date.now() - pending.firstAt > REQUEST_TTL_MS) return null;

  const request: DiscoverRequest =
    'provider' in pending.request ? { ...pending.request, authorizationCode: undefined } : pending.request;
  const state = newSsoState();
  const result = await discoverStores(state, request);
  useDiscovery.setState({ pending: { ...pending, state, request, result, at: Date.now() } });
  const store = result.stores.find((s) => s.code === code);
  return store ? { store, state } : null;
}

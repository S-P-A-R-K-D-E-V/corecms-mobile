import { createContext, useContext } from 'react';

import type { DiscoveredStore } from 'src/api/app-hub';

// ----------------------------------------------------------------------

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: string;
  roles: string[];
  permissions: string[];
  photoURL?: string;
  accessToken: string;
  refreshToken?: string;
  // Dùng để check hồ sơ đã đủ thông tin chưa (xem src/services/profile-completion.ts)
  phoneNumber?: string;
  address?: string;
  bankCode?: string;
  bankNo?: string;
  idCardFrontUrl?: string;
  idCardBackUrl?: string;
  hasFaceEmbedding?: boolean;
  /** Tính năng cửa hàng đang bật (GET /users/me → enabledFeatures), vd "ai.assistant". */
  enabledFeatures?: string[];
};

export type OAuthExtra = {
  nonce?: string;
  firstName?: string | null;
  lastName?: string | null;
  authorizationCode?: string | null;
};

export type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  authenticated: boolean;
  unauthenticated: boolean;
  pendingVerification: { email: string } | null;
  /**
   * Mở app chưa kết nối được máy chủ (mất mạng / 5xx) trong khi máy vẫn còn phiên — chưa phải đăng xuất:
   * trang đăng nhập báo và cho "Thử lại"; app tự thử lại khi quay lại nền trước.
   */
  sessionOffline: boolean;
  /** Đang lấy lại phiên của máy (mở app / thử lại). */
  resumingSession: boolean;
  /** Thử lấy lại phiên của máy ngay (sau lần chưa kết nối được). */
  retrySession: () => Promise<void>;
  login:(email: string, password: string) => Promise<void>;
  loginWithSessionToken: (sessionToken: string) => Promise<void>;
  /** Đăng nhập bằng token nhà cung cấp (hiện dùng cho Sign in with Apple native trên iOS). */
  loginWithOAuth: (provider: 'google' | 'apple', token: string, extra?: OAuthExtra) => Promise<void>;
  /**
   * Bản cửa hàng: vào một cửa hàng đã tìm được qua app-hub/discover — gắn cửa hàng đó (xoá token cũ)
   * rồi đổi mã dùng một lần lấy phiên trên tên miền cửa hàng.
   */
  loginWithDiscoveredStore: (store: DiscoveredStore, state: string) => Promise<void>;
  /** Tự xoá tài khoản (App Store yêu cầu). */
  deleteAccount: () => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => Promise<void>;
  verifyOtp: (email: string, otpCode: string) => Promise<void>;
  resendOtp: (email: string) => Promise<void>;
  refreshUser: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuthContext(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}

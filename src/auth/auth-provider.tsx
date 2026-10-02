import React, { useReducer, useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import axiosInstance, { endpoints, getStorageUrl, setSessionExpiredHandler } from 'src/api/axios';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, SESSION_TOKEN_KEY } from 'src/api/session';
import type { IAuthResponse, ILoginRequest, IRegisterRequest, IVerifyOtpRequest, IResendOtpRequest } from 'src/types/corecms-api';
import { AuthContext, type AuthUser, type OAuthExtra } from './auth-context';
import { resumeSession } from './resume-session';
import { unregisterCurrentPushToken } from 'src/hooks/use-push-registration';
import { storeProfileOf, type DiscoveredStore } from 'src/api/app-hub';
import { forgetStore, setStore } from 'src/services/store-config';
import { queryClient } from 'src/services/query/client';

// ----------------------------------------------------------------------

const STORAGE_KEY = ACCESS_TOKEN_KEY;
const REFRESH_KEY = REFRESH_TOKEN_KEY;
const SESSION_KEY = SESSION_TOKEN_KEY;

// ----------------------------------------------------------------------

enum Types {
  INITIAL = 'INITIAL',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
}

type State = { user: AuthUser | null; loading: boolean };
type Action =
  | { type: Types.INITIAL; payload: { user: AuthUser | null } }
  | { type: Types.LOGIN; payload: { user: AuthUser } }
  | { type: Types.LOGOUT };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case Types.INITIAL:
      return { loading: false, user: action.payload.user };
    // Đăng nhập / đăng xuất là trạng thái dứt khoát — kể cả khi xảy ra lúc đang mở app (vd hết phiên
    // giữa lúc khôi phục, hoặc đăng nhập qua deep link khi app vừa mở) thì cũng thôi màn chờ.
    case Types.LOGIN:
      return { loading: false, user: action.payload.user };
    case Types.LOGOUT:
      return { loading: false, user: null };
    default:
      return state;
  }
}

// ----------------------------------------------------------------------

/** Dựng AuthUser đầy đủ (kèm phone/address/bank/CCCD) từ response `GET /users/me`.
 *  Dùng ở mọi nơi cần biết hồ sơ đã đủ thông tin chưa — response đăng nhập
 *  (IAuthResponse) KHÔNG có các field này nên phải gọi thêm `users.me`. */
function buildUserFromMe(data: any, accessToken: string, refreshToken?: string): AuthUser {
  return {
    id: data.id,
    email: data.email,
    displayName: data.fullName || `${data.firstName} ${data.lastName}`,
    firstName: data.firstName,
    lastName: data.lastName,
    role: data.role || data.roles?.[0] || 'User',
    roles: data.roles || [],
    permissions: data.permissions || [],
    photoURL: data.profileImageUrl ? getStorageUrl(data.profileImageUrl) : undefined,
    accessToken,
    refreshToken,
    phoneNumber: data.phoneNumber,
    address: data.address,
    bankCode: data.bankCode,
    bankNo: data.bankNo,
    idCardFrontUrl: data.idCardFrontUrl,
    idCardBackUrl: data.idCardBackUrl,
    hasFaceEmbedding: !!data.hasFaceEmbedding,
    enabledFeatures: Array.isArray(data.enabledFeatures) ? data.enabledFeatures : undefined,
  };
}

/** Fallback tối thiểu khi `GET /users/me` lỗi ngay sau khi đăng nhập (mạng chập
 *  chờn) — không để một request phụ làm hỏng cả luồng đăng nhập vốn đã thành
 *  công. Thiếu field bank/CCCD ở fallback này chỉ tạm thời: `initialize()`/
 *  `refreshUser()` sẽ nạp lại đầy đủ ở lần sau. */
function buildThinUser(res: IAuthResponse): AuthUser {
  return {
    id: res.id,
    email: res.email,
    displayName: `${res.firstName} ${res.lastName}`,
    firstName: res.firstName,
    lastName: res.lastName,
    role: res.role || res.roles?.[0] || 'User',
    roles: res.roles || [],
    permissions: res.permissions || [],
    photoURL: undefined,
    accessToken: res.token,
    refreshToken: res.refreshToken,
  };
}

/** Gọi `GET /users/me` để có AuthUser đầy đủ; nếu lỗi thì fallback về thin user
 *  thay vì làm cả luồng đăng nhập thất bại. */
async function loadUserAfterAuth(authRes: IAuthResponse, accessToken: string, refreshToken?: string): Promise<AuthUser> {
  try {
    const meRes = await axiosInstance.get(endpoints.users.me);
    return buildUserFromMe(meRes.data, accessToken, refreshToken);
  } catch {
    return buildThinUser(authRes);
  }
}

/** Đăng xuất không chờ mạng chập chờn quá lâu — token trên máy vẫn bị xoá dù server chưa trả lời. */
const LOGOUT_CALL_TIMEOUT_MS = 10_000;

function withinMs(promise: Promise<unknown>, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function setSession(accessToken: string | null, refreshToken?: string | null) {
  if (accessToken) {
    await SecureStore.setItemAsync(STORAGE_KEY, accessToken);
    axiosInstance.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
  } else {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    delete axiosInstance.defaults.headers.common.Authorization;
  }
  if (refreshToken !== undefined) {
    if (refreshToken) {
      await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
    } else {
      await SecureStore.deleteItemAsync(REFRESH_KEY);
    }
  }
}

// ----------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { user: null, loading: true });
  const [pendingVerification, setPendingVerification] = useState<{ email: string } | null>(null);
  // Mở app mà chưa kết nối được máy chủ trong khi máy vẫn còn phiên (mất mạng / 5xx): chưa phải đăng xuất.
  // Trang đăng nhập báo "máy vẫn giữ phiên" + nút Thử lại; app tự thử lại mỗi lần quay lại nền trước.
  const [sessionOffline, setSessionOffline] = useState(false);
  const [resumingSession, setResumingSession] = useState(false);
  const resuming = useRef(false);
  // Tăng mỗi lần đăng nhập / đăng xuất chủ động — kết quả khôi phục phiên chạy dở về sau thì bỏ, không ghi đè.
  const authEpoch = useRef(0);

  /** Đăng nhập / đăng xuất chủ động: thắng mọi lần khôi phục phiên đang chạy dở. */
  const commit = useCallback((action: Action) => {
    authEpoch.current += 1;
    setSessionOffline(false);
    dispatch(action);
  }, []);

  // Hết phiên giữa chừng (axios khôi phục không được vì server từ chối phiên): về "chưa đăng nhập".
  // Token đã được axios xoá; cửa hàng đã nhớ giữ nguyên → các cổng đưa về trang đăng nhập của cửa hàng.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setPendingVerification(null);
      commit({ type: Types.LOGOUT });
      // Người đăng nhập lại có thể là người khác — không để lộ dữ liệu đã nạp của người trước.
      queryClient.clear();
    });
    return () => setSessionExpiredHandler(null);
  }, [commit]);

  // Lấy lại phiên của máy — lúc mở app, và khi thử lại sau lần chưa kết nối được (xem resume-session.ts).
  // accessToken hết hạn → khôi phục bằng sessionToken (server gia hạn phiên thêm 30 ngày). Chỉ mất phiên
  // khi server từ chối (4xx); mất mạng / 5xx giữ nguyên mọi token.
  const initialize = useCallback(async () => {
    if (resuming.current) return;
    resuming.current = true;
    setResumingSession(true);
    const epoch = authEpoch.current;
    try {
      // Lỗi bất ngờ (đọc SecureStore…) → như chưa đăng nhập, không tự thử lại liên tục.
      const result = await resumeSession().catch(() => ({ kind: 'signed-out' as const }));
      // Trong lúc chờ người dùng đã tự đăng nhập / đăng xuất — trạng thái đó mới đúng.
      if (epoch !== authEpoch.current) return;
      let user: AuthUser | null = null;
      if (result.kind === 'ok') {
        if (result.me) user = buildUserFromMe(result.me, result.accessToken, result.refreshToken);
        else if (result.auth) user = buildThinUser(result.auth);
      }
      setSessionOffline(result.kind === 'offline');
      dispatch({ type: Types.INITIAL, payload: { user } });
    } finally {
      resuming.current = false;
      setResumingSession(false);
    }
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Chưa kết nối được lúc mở app: quay lại app (vừa bật mạng / Wi-Fi, mở lại từ đa nhiệm) thì tự thử lại.
  useEffect(() => {
    if (!sessionOffline || state.user) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void initialize();
    });
    return () => sub.remove();
  }, [sessionOffline, state.user, initialize]);

  const loginWithSessionToken = useCallback(async (sessionToken: string) => {
    const res = await axiosInstance.post<IAuthResponse>(endpoints.auth.restoreSession, { sessionToken });
    const { token: accessToken, refreshToken, sessionToken: newSessionToken } = res.data;
    await setSession(accessToken, refreshToken);
    if (newSessionToken) await SecureStore.setItemAsync(SESSION_KEY, newSessionToken);
    const user = await loadUserAfterAuth(res.data, accessToken, refreshToken);
    commit({ type: Types.LOGIN, payload: { user } });
  }, [commit]);

  const loginWithDiscoveredStore = useCallback(async (store: DiscoveredStore, state: string) => {
    // Gắn cửa hàng trước (xoá token của cửa hàng cũ): từ đây axios gọi https://<cửa hàng>/api.
    await setStore(storeProfileOf(store));
    queryClient.clear();
    const res = await axiosInstance.post<IAuthResponse>(endpoints.auth.ssoExchange, { code: store.ssoCode, state });
    const { token: accessToken, refreshToken, sessionToken } = res.data;
    await setSession(accessToken, refreshToken);
    if (sessionToken) await SecureStore.setItemAsync(SESSION_KEY, sessionToken);
    const user = await loadUserAfterAuth(res.data, accessToken, refreshToken);
    commit({ type: Types.LOGIN, payload: { user } });
  }, [commit]);

  const loginWithOAuth = useCallback(async (provider: 'google' | 'apple', token: string, extra?: OAuthExtra) => {
    const res = await axiosInstance.post<IAuthResponse>(endpoints.auth.oauthLogin, {
      provider,
      token,
      nonce: extra?.nonce,
      firstName: extra?.firstName ?? undefined,
      lastName: extra?.lastName ?? undefined,
      authorizationCode: extra?.authorizationCode ?? undefined,
    });
    const { token: accessToken, refreshToken, sessionToken } = res.data;
    await setSession(accessToken, refreshToken);
    if (sessionToken) await SecureStore.setItemAsync(SESSION_KEY, sessionToken);
    const user = await loadUserAfterAuth(res.data, accessToken, refreshToken);
    commit({ type: Types.LOGIN, payload: { user } });
  }, [commit]);

  const login = useCallback(async (email: string, password: string) => {
    const data: ILoginRequest = { email, password };
    let res: { data: IAuthResponse };
    try {
      res = await axiosInstance.post<IAuthResponse>(endpoints.auth.login, data);
    } catch (error: any) {
      if (error?.errors?.['User.EmailNotVerified']) {
        setPendingVerification({ email });
        throw new Error('OTP_REQUIRED');
      }
      throw error;
    }
    const { token, refreshToken, sessionToken, requiresOtpVerification } = res.data;
    if (requiresOtpVerification) {
      setPendingVerification({ email });
      throw new Error('OTP_REQUIRED');
    }
    await setSession(token, refreshToken);
    if (sessionToken) await SecureStore.setItemAsync(SESSION_KEY, sessionToken);
    const user = await loadUserAfterAuth(res.data, token, refreshToken);
    commit({ type: Types.LOGIN, payload: { user } });
  }, [commit]);

  const register = useCallback(
    async (email: string, password: string, firstName: string, lastName: string) => {
      const data: IRegisterRequest = { email, password, firstName, lastName };
      await axiosInstance.post<IAuthResponse>(endpoints.auth.register, data);
      setPendingVerification({ email });
    },
    []
  );

  const verifyOtp = useCallback(async (email: string, otpCode: string) => {
    const data: IVerifyOtpRequest = { email, otpCode };
    const res = await axiosInstance.post<IAuthResponse>(endpoints.auth.verifyOtp, data);
    const { token, refreshToken, sessionToken } = res.data;
    await setSession(token, refreshToken);
    if (sessionToken) await SecureStore.setItemAsync(SESSION_KEY, sessionToken);
    setPendingVerification(null);
    const user = await loadUserAfterAuth(res.data, token, refreshToken);
    commit({ type: Types.LOGIN, payload: { user } });
  }, [commit]);

  const resendOtp = useCallback(async (email: string) => {
    const data: IResendOtpRequest = { email };
    await axiosInstance.post(endpoints.auth.resendOtp, data);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const meRes = await axiosInstance.get(endpoints.users.me);
      const accessToken = (await SecureStore.getItemAsync(STORAGE_KEY)) ?? '';
      const user = buildUserFromMe(meRes.data, accessToken);
      dispatch({ type: Types.LOGIN, payload: { user } });
    } catch {}
  }, []);

  // Đăng xuất MÁY NÀY: gửi sessionToken để server chỉ tắt phiên của máy này (thiết bị khác, web vẫn đăng
  // nhập). Server lấy người dùng từ JWT; userId trong body chỉ để bản server cũ còn nhận. Cửa hàng vẫn nhớ.
  const logout = useCallback(async () => {
    const sessionToken = await SecureStore.getItemAsync(SESSION_KEY);
    // Unregister push token before clearing session so the request still has auth header
    await withinMs(unregisterCurrentPushToken().catch(() => {}), LOGOUT_CALL_TIMEOUT_MS);
    try {
      if (state.user?.id) {
        await axiosInstance.post(
          endpoints.auth.logout,
          { userId: state.user.id, ...(sessionToken ? { sessionToken } : {}) },
          { timeout: LOGOUT_CALL_TIMEOUT_MS }
        );
      }
    } catch {}
    finally {
      await setSession(null, null);
      await SecureStore.deleteItemAsync(SESSION_KEY);
      setPendingVerification(null);
      commit({ type: Types.LOGOUT });
      // Máy dùng chung: người đăng nhập sau không thấy dữ liệu đã nạp của người trước.
      queryClient.clear();
    }
  }, [state.user, commit]);

  // Server xoá dữ liệu cá nhân + vô hiệu mọi phiên; ở máy dọn token VÀ quên luôn cửa hàng (trường hợp
  // duy nhất máy quên cửa hàng) — màn gọi đưa về Chào mừng.
  const deleteAccount = useCallback(async () => {
    await unregisterCurrentPushToken().catch(() => {});
    await axiosInstance.delete(endpoints.auth.deleteAccount, { data: { confirm: true } });
    await setSession(null, null);
    await SecureStore.deleteItemAsync(SESSION_KEY);
    setPendingVerification(null);
    commit({ type: Types.LOGOUT });
    // Ngay sau LOGOUT (không await xen giữa): cổng render lại đã thấy máy không còn cửa hàng → Chào mừng,
    // không ghé trang đăng nhập của cửa hàng vừa rời.
    await forgetStore();
    queryClient.clear();
  }, [commit]);

  const status = state.loading ? 'loading' : state.user ? 'authenticated' : 'unauthenticated';

  const value = useMemo(
    () => ({
      user: state.user,
      loading: status === 'loading',
      authenticated: status === 'authenticated',
      unauthenticated: status === 'unauthenticated',
      pendingVerification,
      sessionOffline,
      resumingSession,
      retrySession: initialize,
      login,
      loginWithSessionToken,
      loginWithOAuth,
      loginWithDiscoveredStore,
      deleteAccount,
      register,
      logout,
      verifyOtp,
      resendOtp,
      refreshUser,
    }),
    [state.user, status, pendingVerification, sessionOffline, resumingSession, initialize, login, loginWithSessionToken, loginWithOAuth, loginWithDiscoveredStore, deleteAccount, register, logout, verifyOtp, resendOtp, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

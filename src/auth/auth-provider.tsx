import React, { useReducer, useCallback, useMemo, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

import axiosInstance, { endpoints, getStorageUrl } from 'src/api/axios';
import type { IAuthResponse, ILoginRequest, IRegisterRequest, IVerifyOtpRequest, IResendOtpRequest, IRestoreSessionRequest } from 'src/types/corecms-api';
import { AuthContext, type AuthUser } from './auth-context';
import { unregisterCurrentPushToken } from 'src/hooks/use-push-registration';

// ----------------------------------------------------------------------

const STORAGE_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const SESSION_KEY = 'sessionToken';

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
    case Types.LOGIN:
      return { ...state, user: action.payload.user };
    case Types.LOGOUT:
      return { ...state, user: null };
    default:
      return state;
  }
}

// ----------------------------------------------------------------------

function jwtDecode(token: string) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

function isValidToken(token: string): boolean {
  try {
    const { exp } = jwtDecode(token);
    return Date.now() < exp * 1000;
  } catch {
    return false;
  }
}

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

  const tryRestoreSession = useCallback(async (): Promise<boolean> => {
    try {
      const savedSession = await SecureStore.getItemAsync(SESSION_KEY);
      if (!savedSession) return false;
      const data: IRestoreSessionRequest = { sessionToken: savedSession };
      const res = await axiosInstance.post<IAuthResponse>(endpoints.auth.restoreSession, data);
      const { token, refreshToken, sessionToken } = res.data;
      await setSession(token, refreshToken);
      if (sessionToken) await SecureStore.setItemAsync(SESSION_KEY, sessionToken);
      const user = await loadUserAfterAuth(res.data, token, refreshToken);
      dispatch({ type: Types.INITIAL, payload: { user } });
      return true;
    } catch {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      return false;
    }
  }, []);

  const initialize = useCallback(async () => {
    try {
      const accessToken = await SecureStore.getItemAsync(STORAGE_KEY);
      if (accessToken && isValidToken(accessToken)) {
        axiosInstance.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
        const meRes = await axiosInstance.get(endpoints.users.me);
        const user = buildUserFromMe(meRes.data, accessToken);
        dispatch({ type: Types.INITIAL, payload: { user } });
        return;
      }
      const restored = await tryRestoreSession();
      if (restored) return;
      dispatch({ type: Types.INITIAL, payload: { user: null } });
    } catch {
      dispatch({ type: Types.INITIAL, payload: { user: null } });
    }
  }, [tryRestoreSession]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const loginWithSessionToken = useCallback(async (sessionToken: string) => {
    const res = await axiosInstance.post<IAuthResponse>(endpoints.auth.restoreSession, { sessionToken });
    const { token: accessToken, refreshToken, sessionToken: newSessionToken } = res.data;
    await setSession(accessToken, refreshToken);
    if (newSessionToken) await SecureStore.setItemAsync(SESSION_KEY, newSessionToken);
    const user = await loadUserAfterAuth(res.data, accessToken, refreshToken);
    dispatch({ type: Types.LOGIN, payload: { user } });
  }, []);

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
    dispatch({ type: Types.LOGIN, payload: { user } });
  }, []);

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
    dispatch({ type: Types.LOGIN, payload: { user } });
  }, []);

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

  const logout = useCallback(async () => {
    // Unregister push token before clearing session so the request still has auth header
    await unregisterCurrentPushToken().catch(() => {});
    try {
      if (state.user?.id) {
        await axiosInstance.post(endpoints.auth.logout, { userId: state.user.id });
      }
    } catch {}
    finally {
      await setSession(null, null);
      await SecureStore.deleteItemAsync(SESSION_KEY);
      setPendingVerification(null);
      dispatch({ type: Types.LOGOUT });
    }
  }, [state.user]);

  const status = state.loading ? 'loading' : state.user ? 'authenticated' : 'unauthenticated';

  const value = useMemo(
    () => ({
      user: state.user,
      loading: status === 'loading',
      authenticated: status === 'authenticated',
      unauthenticated: status === 'unauthenticated',
      pendingVerification,
      login,
      loginWithSessionToken,
      register,
      logout,
      verifyOtp,
      resendOtp,
      refreshUser,
    }),
    [state.user, status, pendingVerification, login, loginWithSessionToken, register, logout, verifyOtp, resendOtp, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

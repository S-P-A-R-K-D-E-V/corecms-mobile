import { createContext, useContext } from 'react';

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
};

export type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  authenticated: boolean;
  unauthenticated: boolean;
  pendingVerification: { email: string } | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithSessionToken: (sessionToken: string) => Promise<void>;
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

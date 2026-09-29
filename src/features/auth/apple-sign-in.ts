import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import type { OAuthExtra } from 'src/auth/auth-context';
import { appleSignInEnabled } from 'src/services/store-config';

// ----------------------------------------------------------------------
// Sign in with Apple native (iOS). Gửi Apple SHA-256 của nonce ngẫu nhiên, gửi backend nonce gốc —
// backend so khớp để token bị lộ không dùng lại được với request khác. Apple chỉ đưa họ tên ở lần
// cấp quyền đầu tiên nên chuyển luôn cho backend lúc đó.
// ----------------------------------------------------------------------

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !appleSignInEnabled) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** null khi người dùng tự huỷ. */
export async function signInWithApple(): Promise<{ token: string; extra: OAuthExtra } | null> {
  const rawNonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) throw new Error('Apple không trả về thông tin đăng nhập.');

    return {
      token: credential.identityToken,
      extra: {
        nonce: rawNonce,
        firstName: credential.fullName?.givenName,
        lastName: credential.fullName?.familyName,
        authorizationCode: credential.authorizationCode,
      },
    };
  } catch (err: any) {
    if (err?.code === 'ERR_REQUEST_CANCELED') return null;
    throw err;
  }
}

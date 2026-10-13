// ----------------------------------------------------------------------
// QR trên trang đăng nhập web (core-fe: sections/auth/jwt/jwt-qr-login.tsx) là JSON
// { type: 'corecms-web-login', code }. Mọi QR khác (mã ghép kiosk, mã vạch hàng, link bất kỳ) không phải
// mã đăng nhập — trả null để màn quét báo rõ thay vì gửi chuỗi lạ lên server.

export const QR_LOGIN_PAYLOAD_TYPE = 'corecms-web-login';

// Mã do BE sinh: 256 bit base64url (43 ký tự). Nới khoảng độ dài để BE đổi cỡ mã không phải ra bản app mới.
const CODE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function parseQrLoginPayload(data: string | null | undefined): string | null {
  if (!data) return null;
  try {
    const json = JSON.parse(data);
    if (json?.type !== QR_LOGIN_PAYLOAD_TYPE || typeof json.code !== 'string') return null;
    return CODE_PATTERN.test(json.code) ? json.code : null;
  } catch {
    return null;
  }
}

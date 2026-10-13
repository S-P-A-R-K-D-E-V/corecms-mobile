import { parseQrLoginPayload, QR_LOGIN_PAYLOAD_TYPE } from '../qr-payload';

// Hợp đồng với trang đăng nhập web (core-fe jwt-qr-login.tsx): QR là JSON { type: 'corecms-web-login', code }.
const CODE = 'kq3Zt0f1nYw8sVb2Lr5Hd7Jm9Pc4Xa6Ue-_GiOTyRBA'; // 43 ký tự base64url như BE sinh

describe('parseQrLoginPayload', () => {
  it('đọc mã từ QR của trang đăng nhập web', () => {
    expect(QR_LOGIN_PAYLOAD_TYPE).toBe('corecms-web-login');
    expect(parseQrLoginPayload(JSON.stringify({ type: 'corecms-web-login', code: CODE }))).toBe(CODE);
  });

  it.each([
    ['QR ghép nối kiosk', JSON.stringify({ type: 'corecms-kiosk-pair', pairingId: 'p', code: '123456' })],
    ['mã 6 số gõ tay của kiosk', '123456'],
    ['mã vạch hàng hoá', '8934567890123'],
    ['đường link bất kỳ', 'https://evil.example/auth/qr?code=abc'],
    ['JSON thiếu code', JSON.stringify({ type: 'corecms-web-login' })],
    ['code không phải chuỗi', JSON.stringify({ type: 'corecms-web-login', code: 42 })],
    ['code quá ngắn', JSON.stringify({ type: 'corecms-web-login', code: 'abc' })],
    ['code có ký tự lạ', JSON.stringify({ type: 'corecms-web-login', code: `${CODE.slice(0, 30)}/../x` })],
    ['JSON là mảng', JSON.stringify([{ type: 'corecms-web-login', code: CODE }])],
    ['JSON null', 'null'],
    ['chuỗi rỗng', ''],
  ])('bỏ qua %s', (_name, data) => {
    expect(parseQrLoginPayload(data)).toBeNull();
  });

  it('bỏ qua giá trị rỗng', () => {
    expect(parseQrLoginPayload(null)).toBeNull();
    expect(parseQrLoginPayload(undefined)).toBeNull();
  });
});

jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    CameraView: (props: any) => <View testID="camera" {...props} />,
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));

jest.mock('src/services/haptics', () => ({ haptics: { success: jest.fn() } }));

jest.mock('src/auth/auth-context', () => ({
  useAuthContext: () => ({ authenticated: true, user: { email: 'lan@example.com' } }),
}));

jest.mock('src/api/qr-login', () => ({
  inspectQrLogin: jest.fn(),
  approveQrLogin: jest.fn(),
  rejectQrLogin: jest.fn(),
}));

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { approveQrLogin, inspectQrLogin, rejectQrLogin } from 'src/api/qr-login';
import { t } from 'src/i18n';
import { QrLoginScreen } from '../QrLoginScreen';

// Màn duyệt đăng nhập web bằng mã QR: quét xong KHÔNG tự cho đăng nhập — người dùng thấy trang web, trình duyệt,
// IP đang xin đăng nhập rồi mới bấm Đồng ý / Từ chối. QR không phải mã đăng nhập thì không gọi server.

const inspect = inspectQrLogin as jest.Mock;
const approve = approveQrLogin as jest.Mock;
const reject = rejectQrLogin as jest.Mock;

const CODE = 'kq3Zt0f1nYw8sVb2Lr5Hd7Jm9Pc4Xa6Ue-_GiOTyRBA';
const LOGIN_QR = JSON.stringify({ type: 'corecms-web-login', code: CODE });
const INFO = {
  host: 'shop-a.store.devbyspark.com',
  browser: 'Chrome · Windows',
  ipAddress: '203.0.113.7',
  requestedAt: '2026-10-13T08:00:00Z',
  expiresInSeconds: 110,
};

function scan(data: string) {
  fireEvent(screen.getByTestId('camera'), 'onBarcodeScanned', { data });
}

beforeEach(() => {
  jest.clearAllMocks();
  inspect.mockResolvedValue(INFO);
  approve.mockResolvedValue(undefined);
  reject.mockResolvedValue(undefined);
});

describe('QrLoginScreen', () => {
  it('quét mã đăng nhập → hiện trình duyệt đang xin đăng nhập, chưa duyệt gì', async () => {
    render(<QrLoginScreen />);

    // Camera báo cùng một mã nhiều lần trước khi màn kịp đổi — chỉ hỏi server một lần.
    const onBarcodeScanned = screen.getByTestId('camera').props.onBarcodeScanned;
    await act(async () => {
      onBarcodeScanned({ data: LOGIN_QR });
      onBarcodeScanned({ data: LOGIN_QR });
    });

    expect(await screen.findByText(INFO.host)).toBeTruthy();
    expect(screen.getByText('Chrome · Windows')).toBeTruthy();
    expect(screen.getByText('203.0.113.7')).toBeTruthy();
    expect(screen.getByText(t('qrLogin.confirmAs', { email: 'lan@example.com' }))).toBeTruthy();
    expect(screen.getByText(t('qrLogin.warning'))).toBeTruthy();
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(inspect).toHaveBeenCalledWith(CODE);
    expect(approve).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
  });

  it('bấm Đồng ý → duyệt đúng mã đó rồi báo đã cho phép', async () => {
    render(<QrLoginScreen />);
    scan(LOGIN_QR);

    fireEvent.press(await screen.findByText(t('qrLogin.approve')));

    expect(await screen.findByText(t('qrLogin.approved'))).toBeTruthy();
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith(CODE);
    expect(reject).not.toHaveBeenCalled();
  });

  it('bấm Từ chối → báo server từ chối, không duyệt', async () => {
    render(<QrLoginScreen />);
    scan(LOGIN_QR);

    fireEvent.press(await screen.findByText(t('qrLogin.reject')));

    expect(await screen.findByText(t('qrLogin.rejected'))).toBeTruthy();
    expect(reject).toHaveBeenCalledWith(CODE);
    expect(approve).not.toHaveBeenCalled();
  });

  it('từ chối mà mất mạng → vẫn coi là đã từ chối (trình duyệt kia không được duyệt)', async () => {
    reject.mockRejectedValue('Network Error');
    render(<QrLoginScreen />);
    scan(LOGIN_QR);

    fireEvent.press(await screen.findByText(t('qrLogin.reject')));

    expect(await screen.findByText(t('qrLogin.rejected'))).toBeTruthy();
  });

  it('đồng ý mà mã đã hết hạn → báo hết hạn, cho quét lại', async () => {
    approve.mockRejectedValue({ status: 400, errors: { 'Auth.InvalidQrLoginCode': ['Mã đăng nhập đã hết hạn hoặc không hợp lệ.'] } });
    render(<QrLoginScreen />);
    scan(LOGIN_QR);

    fireEvent.press(await screen.findByText(t('qrLogin.approve')));

    expect(await screen.findByText(t('qrLogin.expired'))).toBeTruthy();
    expect(screen.queryByText(t('qrLogin.approved'))).toBeNull();

    fireEvent.press(screen.getByText(t('qrLogin.scanAgain')));
    expect(screen.getByTestId('camera')).toBeTruthy();
  });

  it('mã của cửa hàng khác → báo sai cửa hàng, không có nút duyệt', async () => {
    inspect.mockRejectedValue({ status: 409, title: 'Mã này thuộc trang khac.store.devbyspark.com…', errorCodes: ['Auth.QrLoginWrongStore'] });
    render(<QrLoginScreen />);

    scan(LOGIN_QR);

    expect(await screen.findByText(t('qrLogin.wrongStore'))).toBeTruthy();
    expect(screen.queryByText(t('qrLogin.approve'))).toBeNull();
    expect(approve).not.toHaveBeenCalled();
  });

  it.each([
    ['QR ghép nối kiosk', JSON.stringify({ type: 'corecms-kiosk-pair', code: '123456' })],
    ['đường link lạ', 'https://evil.example/login'],
  ])('%s → báo không phải mã đăng nhập, không gọi server, vẫn quét tiếp', async (_name, data) => {
    render(<QrLoginScreen />);

    scan(data);

    expect(await screen.findByText(t('qrLogin.notLoginCode'))).toBeTruthy();
    expect(screen.getByTestId('camera')).toBeTruthy();
    expect(inspect).not.toHaveBeenCalled();

    // Đưa đúng mã vào thì vẫn quét được.
    scan(LOGIN_QR);
    await waitFor(() => expect(inspect).toHaveBeenCalledWith(CODE));
  });
});

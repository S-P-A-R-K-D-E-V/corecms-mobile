let mockUser: any = null;
jest.mock('../auth-context', () => ({
  useAuthContext: () => ({ user: mockUser }),
}));
jest.mock('src/features/checkin/CheckinScreen', () => {
  const { Text } = require('react-native');
  return { CheckinScreen: () => <Text>màn chấm công</Text> };
});
jest.mock('src/features/shift-cash/ShiftCashScreen', () => {
  const { Text } = require('react-native');
  return { ShiftCashScreen: () => <Text>màn kiểm quầy</Text> };
});
jest.mock('src/features/shift-cash/AccessGate', () => ({
  ShiftCashAccessGate: ({ children }: any) => children,
}));

import React from 'react';
import { render, screen } from '@testing-library/react-native';

import Checkin from 'src/app/(tabs)/checkin';
import ShiftCash from 'src/app/shift-cash';

import {
  CLIENT_PLATFORM,
  PLATFORM_FEATURES,
  isPlatformFeatureBlocked,
  isPlatformFeatureDisabledError,
} from '../platform-features';

// Bật / tắt tính năng theo nền tảng (Core-be PlatformFeatures): app khai nền tảng qua header, ẩn theo blockedFeatures
// của GET /users/me, nhận ra 403 platform_feature_disabled.

describe('platform features', () => {
  it('app khai nền tảng của máy (ios / android)', () => {
    expect(['ios', 'android']).toContain(CLIENT_PLATFORM);
  });

  it('chỉ bị tắt khi blockedFeatures chứa đúng khoá', () => {
    const key = PLATFORM_FEATURES.selfCheckIn;

    expect(isPlatformFeatureBlocked({ blockedFeatures: [key] }, key)).toBe(true);
    expect(isPlatformFeatureBlocked({ blockedFeatures: ['other'] }, key)).toBe(false);
    expect(isPlatformFeatureBlocked({}, key)).toBe(false);
    expect(isPlatformFeatureBlocked(null, key)).toBe(false);
  });

  it('nhận ra lỗi 403 tính năng bị tắt — body đã bóc hoặc AxiosError', () => {
    const body = { status: 403, error: 'platform_feature_disabled', message: 'x' };

    expect(isPlatformFeatureDisabledError(body)).toBe(true);
    expect(isPlatformFeatureDisabledError({ response: { status: 403, data: body } })).toBe(true);
    expect(isPlatformFeatureDisabledError({ status: 403, error: 'forbidden' })).toBe(false);
    expect(isPlatformFeatureDisabledError('Something went wrong')).toBe(false);
    expect(isPlatformFeatureDisabledError(null)).toBe(false);
  });
});

describe('tab Chấm công', () => {
  it('bị tắt trên app → báo đã tắt thay vì mở camera chấm công', () => {
    mockUser = { roles: ['Staff'], blockedFeatures: [PLATFORM_FEATURES.selfCheckIn] };
    render(<Checkin />);

    expect(screen.getByText('Chấm công trên app đã tắt')).toBeTruthy();
    expect(screen.queryByText('màn chấm công')).toBeNull();
  });

  it('không bị tắt → màn chấm công như cũ', () => {
    mockUser = { roles: ['Staff'], blockedFeatures: [] };
    render(<Checkin />);

    expect(screen.getByText('màn chấm công')).toBeTruthy();
  });
});

describe('màn Kiểm quầy', () => {
  it('bị tắt trên app → báo đã tắt, không mở màn kiểm quầy', () => {
    mockUser = { role: 'Staff', roles: ['Staff'], blockedFeatures: [PLATFORM_FEATURES.shiftCash] };
    render(<ShiftCash />);

    expect(screen.getByText('Kiểm quầy trên app đã tắt')).toBeTruthy();
    expect(screen.queryByText('màn kiểm quầy')).toBeNull();
  });

  it('không bị tắt → màn kiểm quầy như cũ', () => {
    mockUser = { role: 'Staff', roles: ['Staff'], blockedFeatures: [] };
    render(<ShiftCash />);

    expect(screen.getByText('màn kiểm quầy')).toBeTruthy();
  });
});

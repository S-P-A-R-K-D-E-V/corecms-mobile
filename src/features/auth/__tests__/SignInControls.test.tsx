jest.mock('expo-apple-authentication', () => {
  const { View } = require('react-native');
  return {
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
    AppleAuthenticationButton: (props: any) => <View testID="apple-button" {...props} />,
    isAvailableAsync: jest.fn(async () => true),
  };
});

import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from 'src/components/ui';
import { EmailAccountToggle, OAuthButtons } from '../SignInControls';

// Trang đăng nhập (Chào mừng + trang của cửa hàng): ba nút xếp dọc, mỗi nút cả hàng, Apple cùng cỡ với
// Google (HIG / guideline 4.8), trình đọc màn hình đọc đúng "nút" + nhãn + trạng thái.

const heightOf = (node: any) => StyleSheet.flatten(node.props.style)?.height;

/** Khung bọc nút Apple native (View cha có height / pointerEvents). */
function appleWrapper() {
  let node: any = screen.getByTestId('apple-button').parent;
  while (node && heightOf(node) === undefined) node = node.parent;
  return node;
}

/** Cỡ chữ hệ thống giả lập (bộ mock Jest của RN mặc định fontScale 2). */
function setFontScale(fontScale: number) {
  const window = { width: 375, height: 667, scale: 2, fontScale };
  Dimensions.set({ window, screen: window });
}

beforeEach(() => setFontScale(1));

describe('OAuthButtons', () => {
  it('iOS: Google rồi Apple, cả hàng, cùng chiều cao 50', () => {
    const onGoogle = jest.fn();
    const onApple = jest.fn();
    render(<OAuthButtons apple onGoogle={onGoogle} onApple={onApple} />);

    const google = screen.getByRole('button', { name: 'Tiếp tục với Google' });
    const apple = screen.getByTestId('apple-button');
    // Apple là nút "Continue with Apple" native, rộng cả hàng, cao bằng nút Google.
    expect(apple.props.buttonType).toBe(1);
    expect(StyleSheet.flatten(apple.props.style)).toMatchObject({ width: '100%', height: 50 });
    expect(heightOf(appleWrapper())).toBe(50);

    fireEvent.press(google);
    expect(onGoogle).toHaveBeenCalledTimes(1);
    fireEvent(apple, 'onPress');
    expect(onApple).toHaveBeenCalledTimes(1);
  });

  it('Android (apple=false): chỉ Google', () => {
    render(<OAuthButtons apple={false} onGoogle={jest.fn()} onApple={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Tiếp tục với Google' })).toBeTruthy();
    expect(screen.queryByTestId('apple-button')).toBeNull();
  });

  it('đang đăng nhập: cả hai nút bị khoá', () => {
    const onGoogle = jest.fn();
    const onApple = jest.fn();
    render(<OAuthButtons apple disabled onGoogle={onGoogle} onApple={onApple} />);
    const google = screen.getByRole('button', { name: 'Tiếp tục với Google' });
    expect(google.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(google);
    expect(onGoogle).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId('apple-button'), 'onPress');
    expect(onApple).not.toHaveBeenCalled();
  });

  it('chữ phóng to: Apple cao theo (tối đa 64), không bao giờ thấp hơn Google', () => {
    setFontScale(1.3);
    render(<OAuthButtons apple onGoogle={jest.fn()} onApple={jest.fn()} />);
    expect(heightOf(appleWrapper())).toBe(64);
    expect(StyleSheet.flatten(screen.getByTestId('apple-button').props.style).height).toBe(64);
  });
});

describe('EmailAccountToggle', () => {
  it('là nút có nhãn, báo đang mở / đóng', () => {
    const onPress = jest.fn();
    const { rerender } = render(<EmailAccountToggle open={false} onPress={onPress} />);
    const toggle = screen.getByRole('button', { name: 'Đăng nhập bằng tài khoản email' });
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
    fireEvent.press(toggle);
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(<EmailAccountToggle open onPress={onPress} />);
    expect(screen.getByRole('button', { name: 'Đăng nhập bằng tài khoản email' }).props.accessibilityState).toMatchObject({
      expanded: true,
    });
  });
});

describe('Button (trợ năng)', () => {
  it('đang tải: chữ thành vòng quay nhưng vẫn đọc được nhãn, báo bận', () => {
    render(
      <Button loading onPress={jest.fn()}>
        Đăng nhập
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Đăng nhập' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  });
});

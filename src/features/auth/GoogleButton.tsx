import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { PressableScale, Text } from 'src/components/ui';
import { SIGN_IN_BUTTON_HEIGHT } from './sign-in';

// ----------------------------------------------------------------------
// Nút "Tiếp tục với Google" theo hướng dẫn thương hiệu của Google: nền sáng, viền mảnh, logo "G" bốn
// màu nguyên bản (không tô đơn sắc). Luôn cả hàng (đủ chỗ cho chữ cỡ thường); cao `height` — màn đăng nhập
// truyền cùng chiều cao với nút Apple (signInButtonHeight) để hai nút luôn bằng nhau.
// ----------------------------------------------------------------------

function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export function GoogleButton({
  label,
  disabled,
  height = SIGN_IN_BUTTON_HEIGHT,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  /** Chiều cao nút (mặc định 50 = nút Apple native). */
  height?: number;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={{ opacity: disabled ? 0.6 : 1 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <View
        className="rounded-[12px] flex-row items-center justify-center bg-white border border-[#747775]"
        style={{ minHeight: height, paddingHorizontal: 16, paddingVertical: 6, gap: 10 }}
      >
        <GoogleG size={20} />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.6}
          style={{ flexShrink: 1 }}
          className="text-[17px] font-semibold text-[#1F1F1F]"
        >
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

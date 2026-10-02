import { forwardRef, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions, View, type TextInput } from 'react-native';
import { useColorScheme } from 'nativewind';
import * as AppleAuthentication from 'expo-apple-authentication';

import { Icon, Pressable, PressableScale, Text, TextField } from 'src/components/ui';
import type { TextFieldProps } from 'src/components/ui/input';
import { useT } from 'src/i18n';
import { appleSignInEnabled } from 'src/services/store-config';
import { useFontSettings } from 'src/theme/FontProvider';
import { isAppleSignInAvailable } from './apple-sign-in';
import type { NoStoreNotice as NoStoreNoticeData } from './discovery';
import { GoogleButton } from './GoogleButton';
import { signInButtonHeight } from './sign-in';

// ----------------------------------------------------------------------
// Khối nút đăng nhập dùng chung cho màn Chào mừng (nền tảng, hồng Spark Store) và trang đăng nhập của
// một cửa hàng (màu cửa hàng) — ba nút xếp dọc, mỗi nút cả hàng, cao bằng nhau:
//   [ G  Tiếp tục với Google            ]
//   [   Tiếp tục với Apple             ]   ← chỉ iOS, nút native của Apple (đúng HIG, chữ do iOS vẽ)
//   [ ✉  Đăng nhập bằng tài khoản email ⌄ ]   ← mở / đóng form ngay trên trang
// Apple cùng cỡ, ngay dưới Google (guideline 4.8: Apple nổi bật ngang Google). Android không có Apple.
// ----------------------------------------------------------------------

/** Tỉ lệ chữ thật trên màn: cỡ chữ hệ thống (Dynamic Type / Android) × cỡ chữ chọn trong app. */
function useTextScale(): number {
  const { fontScale } = useWindowDimensions();
  const { scale } = useFontSettings();
  return Math.min(fontScale || 1, 1.6) * (scale || 1);
}

/** Chiều cao chung của các nút đăng nhập — cập nhật ngay khi người dùng đổi cỡ chữ. */
export function useSignInButtonHeight(): number {
  return signInButtonHeight(useTextScale());
}

/**
 * Có Sign in with Apple không — iOS mặc định CÓ ngay từ khung hình đầu (iOS 13+ luôn có; bản build tối
 * thiểu iOS 15) rồi mới hỏi máy: nút Apple không "nhảy" vào sau Google, không có lúc màn chỉ có Google.
 */
export function useAppleSignInAvailable(): boolean {
  const [available, setAvailable] = useState(() => Platform.OS === 'ios' && appleSignInEnabled);
  useEffect(() => {
    let alive = true;
    isAppleSignInAvailable().then((ok) => {
      if (alive) setAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

/** Đọc lời nhắn / lỗi mới hiện cho người dùng trình đọc màn hình (iOS không tự đọc chữ vừa xuất hiện). */
export function useAnnounce(message: string | null | undefined) {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
}

export function OAuthButtons({
  apple,
  disabled,
  onGoogle,
  onApple,
}: {
  apple: boolean;
  disabled?: boolean;
  onGoogle: () => void;
  onApple: () => void;
}) {
  const t = useT();
  const { colorScheme } = useColorScheme();
  const height = useSignInButtonHeight();

  return (
    <View style={{ gap: 10 }}>
      <GoogleButton label={t('welcome.continueGoogle')} height={height} disabled={disabled} onPress={onGoogle} />
      {apple ? (
        // Nút native cần kích thước rõ: cả hàng, cao bằng nút Google.
        <View style={{ height, opacity: disabled ? 0.6 : 1 }} pointerEvents={disabled ? 'none' : 'auto'}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              colorScheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={12}
            style={{ width: '100%', height }}
            onPress={onApple}
          />
        </View>
      ) : null}
    </View>
  );
}

/** "✉ Đăng nhập bằng tài khoản email ⌄" — bấm để mở / đóng form email ngay trên trang. */
export function EmailAccountToggle({ open, disabled, onPress }: { open: boolean; disabled?: boolean; onPress: () => void }) {
  const t = useT();
  const height = useSignInButtonHeight();
  const largeText = useTextScale() > 1.2;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={{ opacity: disabled ? 0.6 : 1 }}
      accessibilityRole="button"
      accessibilityLabel={t('signIn.emailAccount')}
      accessibilityState={{ expanded: open, disabled: !!disabled }}
    >
      <View
        className="rounded-[12px] flex-row items-center justify-center gap-2 px-4 py-2.5 border border-line dark:border-line-dark bg-ink/5 dark:bg-white/5"
        style={{ minHeight: height }}
      >
        <Icon name="email-outline" size={20} />
        {/* Cỡ chữ thường: một dòng, tự co nhẹ cho vừa (tiếng Việt dài hơn, iPhone SE). Chữ phóng to: xuống 2 dòng. */}
        <Text
          className="text-[16px] font-semibold text-center"
          style={{ flexShrink: 1 }}
          numberOfLines={largeText ? 2 : 1}
          adjustsFontSizeToFit={!largeText}
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.6}
        >
          {t('signIn.emailAccount')}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} tone="muted" />
      </View>
    </PressableScale>
  );
}

/** Ô mật khẩu có nút hiện / ẩn; tự điền mật khẩu đã lưu (iOS Keychain / Android Autofill). */
export const PasswordField = forwardRef<TextInput, Omit<TextFieldProps, 'secureTextEntry' | 'right'>>(function PasswordField(
  props,
  ref
) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      ref={ref}
      icon="lock-outline"
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="password"
      textContentType="password"
      importantForAutofill="yes"
      right={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t(visible ? 'signIn.hidePassword' : 'signIn.showPassword')}
          className="py-2"
        >
          <Icon name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} tone="faint" />
        </Pressable>
      }
      {...props}
    />
  );
});

/**
 * Đăng nhập Google / Apple hợp lệ nhưng tài khoản chưa thuộc cửa hàng nào: nói rõ, gợi ý đăng nhập bằng
 * tài khoản email cửa hàng đã cấp hoặc nhờ chủ cửa hàng thêm email. Apple "Ẩn email" là trường hợp hay gặp.
 */
export function NoStoreNotice({ notice, onClose }: { notice: NoStoreNoticeData; onClose: () => void }) {
  const t = useT();
  const desc = notice.email ? t('signIn.noStoreDesc', { account: notice.email }) : t('signIn.noStoreDescNoEmail');
  const hint = notice.via === 'apple' ? t('storePicker.emptyAppleHint') : null;
  // Hiện ngay sau khi đăng nhập Google / Apple xong — đọc luôn cho người dùng trình đọc màn hình.
  useAnnounce([t('signIn.noStoreTitle'), desc, hint].filter(Boolean).join('. '));
  return (
    <View className="rounded-2xl bg-warning/10 border border-warning/30 p-4">
      <View className="flex-row items-start gap-3">
        <Icon name="store-search-outline" size={22} tone="warning" />
        <View className="flex-1 gap-1">
          <Text variant="headline">{t('signIn.noStoreTitle')}</Text>
          <Text variant="footnote" tone="muted">{desc}</Text>
          {hint ? <Text variant="footnote" tone="muted" className="mt-1">{hint}</Text> : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Icon name="close" size={18} tone="faint" />
        </Pressable>
      </View>
    </View>
  );
}

import { forwardRef, useState } from 'react';
import { PixelRatio, View, type TextInput } from 'react-native';
import { useColorScheme } from 'nativewind';
import * as AppleAuthentication from 'expo-apple-authentication';

import { Icon, Pressable, PressableScale, Text, TextField } from 'src/components/ui';
import type { TextFieldProps } from 'src/components/ui/input';
import { useT } from 'src/i18n';
import type { NoStoreNotice as NoStoreNoticeData } from './discovery';
import { GoogleButton } from './GoogleButton';

// ----------------------------------------------------------------------
// Khối nút đăng nhập dùng chung cho màn Chào mừng (nền tảng, hồng Spark Store) và trang đăng nhập của
// một cửa hàng (màu cửa hàng):
//   [ G Tiếp tục với Google ][  Tiếp tục với Apple ]   ← iOS: một hàng, cao bằng nhau
//   [ ✉ Đăng nhập bằng tài khoản email            ⌄ ]   ← mở / đóng form ngay trên trang
// Android không có Apple: Google một mình cả hàng. Apple dùng nút native của Apple (đúng HIG, chữ do
// iOS vẽ và tự co cho vừa nửa hàng).
// ----------------------------------------------------------------------

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
  if (!apple) return <GoogleButton label={t('welcome.continueGoogle')} disabled={disabled} onPress={onGoogle} />;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <GoogleButton compact label={t('welcome.continueGoogle')} disabled={disabled} onPress={onGoogle} />
      </View>
      {/* Nút native cần kích thước rõ: cao theo hàng (bằng nút Google), tối thiểu 50. */}
      <View style={{ flex: 1, minHeight: 50, opacity: disabled ? 0.6 : 1 }} pointerEvents={disabled ? 'none' : 'auto'}>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            colorScheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={12}
          style={{ width: '100%', flex: 1, minHeight: 50 }}
          onPress={onApple}
        />
      </View>
    </View>
  );
}

/** "✉ Đăng nhập bằng tài khoản email ⌄" — bấm để mở / đóng form email ngay trên trang. */
export function EmailAccountToggle({ open, disabled, onPress }: { open: boolean; disabled?: boolean; onPress: () => void }) {
  const t = useT();
  const largeText = PixelRatio.getFontScale() > 1.2;
  return (
    <PressableScale onPress={onPress} disabled={disabled} style={{ opacity: disabled ? 0.6 : 1 }}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('signIn.emailAccount')}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        className="min-h-[50px] rounded-[12px] flex-row items-center justify-center gap-2 px-4 py-2.5 border border-line dark:border-line-dark bg-ink/5 dark:bg-white/5"
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
  return (
    <View className="rounded-2xl bg-warning/10 border border-warning/30 p-4">
      <View className="flex-row items-start gap-3">
        <Icon name="store-search-outline" size={22} tone="warning" />
        <View className="flex-1 gap-1">
          <Text variant="headline">{t('signIn.noStoreTitle')}</Text>
          <Text variant="footnote" tone="muted">
            {notice.email ? t('signIn.noStoreDesc', { account: notice.email }) : t('signIn.noStoreDescNoEmail')}
          </Text>
          {notice.via === 'apple' ? (
            <Text variant="footnote" tone="muted" className="mt-1">{t('storePicker.emptyAppleHint')}</Text>
          ) : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Icon name="close" size={18} tone="faint" />
        </Pressable>
      </View>
    </View>
  );
}

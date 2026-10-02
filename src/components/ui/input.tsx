import { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { MotiView } from 'moti';
import { useColorScheme } from 'nativewind';
import { Text } from './text';
import { Icon, type IconName } from './icon';
import { cn } from './utils';
import { brand } from 'src/theme';
import { spring } from 'src/theme/motion';
import { useFontSettings, resolveFontFamily } from 'src/theme/FontProvider';

export type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string;
  icon?: IconName;
  className?: string;
  containerClassName?: string;
  /** Phần tử bên phải ô (vd nút hiện/ẩn mật khẩu). */
  right?: React.ReactNode;
  /** Màu viền + icon khi đang nhập — mặc định màu cửa hàng; màn nền tảng (Chào mừng) truyền hồng Spark Store. */
  accentColor?: string;
};

/** Apple-style field: soft gray fill, hairline that lights up + a subtle
 *  1.02 scale on focus. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, icon, className, containerClassName, onFocus, onBlur, multiline, right, accentColor, ...props },
  ref
) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const [focused, setFocused] = useState(false);
  const fam = resolveFontFamily(useFontSettings().family);

  const idleBorder = error ? brand.error : dark ? '#38383A' : '#E2E2E7';
  const fill = dark ? 'rgba(255,255,255,0.06)' : '#F2F2F7';

  return (
    <View className={cn('gap-1.5', containerClassName)}>
      {label ? (
        // Nhãn đã gắn vào ô nhập (accessibilityLabel bên dưới) — ẩn bản chữ với trình đọc màn hình để không đọc hai lần.
        <Text variant="footnote" tone="muted" className="font-semibold ml-1" accessibilityElementsHidden importantForAccessibility="no">
          {label}
        </Text>
      ) : null}
      <MotiView
        animate={{ borderColor: focused && !error ? accentColor ?? brand.primary : idleBorder, scale: focused ? 1.02 : 1 }}
        transition={{ type: 'spring', ...spring.soft }}
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 8,
          borderRadius: 10,
          borderWidth: 1,
          minHeight: 48,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 0,
          backgroundColor: fill,
        }}
      >
        {icon ? (
          <Icon name={icon} size={18} tone={focused ? 'primary' : 'faint'} color={focused && accentColor ? accentColor : undefined} />
        ) : null}
        <TextInput
          ref={ref}
          // Trợ năng: nhãn hiện phía trên là Text riêng — gắn vào ô để VoiceOver / TalkBack đọc "Email, ô nhập"
          // thay vì chỉ "ô nhập" (ô không có placeholder). Màn gọi truyền accessibilityLabel riêng thì dùng cái đó.
          accessibilityLabel={label}
          placeholderTextColor={brand.faint}
          multiline={multiline}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          className={cn('flex-1 text-[16px] text-ink dark:text-ink-dark', className)}
          style={fam ? { fontFamily: fam } : undefined}
          {...props}
        />
        {right}
      </MotiView>
      {error ? <Text variant="caption" tone="error" className="ml-1">{error}</Text> : null}
    </View>
  );
});

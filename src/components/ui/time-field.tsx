import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { MotiView } from 'moti';
import { useColorScheme } from 'nativewind';
import { Text } from './text';
import { Icon } from './icon';
import { Pressable } from './pressable';
import { cn } from './utils';
import { brand } from 'src/theme';
import { spring } from 'src/theme/motion';
import { useFontSettings, resolveFontFamily } from 'src/theme/FontProvider';

// ----------------------------------------------------------------------
// Ô nhập GIỜ "HH:mm": bàn phím số, tự chèn dấu ":" sau 2 chữ số nên chỉ cần gõ
// 4 số (0830 → 08:30). Không thêm lib date-picker (ràng buộc build Android
// mong manh) — validate HH:mm ở nơi dùng. Có nút xoá nhanh để bỏ trống.
// ----------------------------------------------------------------------

/** Chuỗi tự do → "HH:mm": chỉ giữ số, chèn ":" sau 2 số đầu. */
function maskTime(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

export type TimeFieldProps = {
  label?: string;
  value: string;
  onChangeTime: (value: string) => void;
  placeholder?: string;
  error?: string;
  containerClassName?: string;
};

export function TimeField({
  label,
  value,
  onChangeTime,
  placeholder = '08:30',
  error,
  containerClassName,
}: TimeFieldProps) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const [focused, setFocused] = useState(false);
  const fam = resolveFontFamily(useFontSettings().family);

  const idleBorder = error ? brand.error : dark ? '#38383A' : '#E2E2E7';
  const fill = dark ? 'rgba(255,255,255,0.06)' : '#F2F2F7';

  return (
    <View className={cn('gap-1.5', containerClassName)}>
      {label ? <Text variant="footnote" tone="muted" className="font-semibold ml-1">{label}</Text> : null}
      <MotiView
        animate={{ borderColor: focused && !error ? brand.primary : idleBorder, scale: focused ? 1.02 : 1 }}
        transition={{ type: 'spring', ...spring.soft }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: 10,
          borderWidth: 1,
          minHeight: 48,
          paddingHorizontal: 14,
          backgroundColor: fill,
        }}
      >
        <Icon name="clock-outline" size={18} tone={focused ? 'primary' : 'faint'} />
        <TextInput
          value={value}
          onChangeText={(raw) => onChangeTime(maskTime(raw))}
          placeholder={placeholder}
          placeholderTextColor={brand.faint}
          keyboardType="number-pad"
          maxLength={5}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 text-[16px] text-ink dark:text-ink-dark"
          style={[{ fontVariant: ['tabular-nums'] }, fam ? { fontFamily: fam } : null]}
        />
        {value ? (
          <Pressable onPress={() => onChangeTime('')} hitSlop={8}>
            <Icon name="close-circle" size={16} tone="faint" />
          </Pressable>
        ) : null}
      </MotiView>
      {error ? <Text variant="caption" tone="error" className="ml-1">{error}</Text> : null}
    </View>
  );
}

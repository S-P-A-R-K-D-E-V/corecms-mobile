import { View, Text as RNText, type StyleProp, type ViewStyle } from 'react-native';
import { cn } from './utils';
import { useFontSettings, resolveFontFamily } from 'src/theme/FontProvider';

// ----------------------------------------------------------------------
// Huy hiệu số đếm (chuông thông báo, tin nhắn chưa đọc, số ca trên dải ngày, số mục trên thẻ...).
// Trước đây mỗi nơi tự dựng viên tròn cao CỐ ĐỊNH 16/20px với <Text className="text-[9px]"> — Text
// dùng chung mặc định 'body' nên vẫn mang lineHeight 22px, còn cỡ chữ trong app (FontProvider) và
// cỡ chữ iOS (Dynamic Type) lại phóng to số → trên iOS số bị đẩy xuống / xén mất nửa.
// Ở đây mọi kích thước suy ra từ cỡ chữ: lineHeight khai báo rõ, viên dùng minHeight (lớn lên chứ
// không xén), và KHÔNG nhận phóng chữ — kiểu huy hiệu thông báo chuẩn của iOS/Android.
// ----------------------------------------------------------------------

type Size = 'sm' | 'md';
type Tone = 'error' | 'primary' | 'soft' | 'onPrimary';

const SIZES: Record<Size, { fontSize: number; lineHeight: number; height: number; padX: number }> = {
  // Chấm trên icon (chuông, nút đầu trang), dải chọn ngày.
  sm: { fontSize: 10, lineHeight: 12, height: 16, padX: 4 },
  // Cạnh tiêu đề: danh sách chat, tiêu đề thẻ.
  md: { fontSize: 11, lineHeight: 14, height: 20, padX: 6 },
};

const TONES: Record<Tone, { box: string; text: string }> = {
  error: { box: 'bg-error', text: 'text-white' },
  primary: { box: 'bg-primary', text: 'text-white' },
  soft: { box: 'bg-primary-soft', text: 'text-primary' },
  onPrimary: { box: 'bg-white/25', text: 'text-white' },
};

/** Chiều cao viên huy hiệu — để chừa chỗ trống đúng bằng nó khi không có số (giữ hàng thẳng). */
export function countBadgeHeight(size: Size = 'sm'): number {
  return SIZES[size].height;
}

/** "99+" khi vượt ngưỡng. */
export function formatBadgeCount(count: number, max = 99): string {
  return count > max ? `${max}+` : String(count);
}

export type CountBadgeProps = {
  count: number | null | undefined;
  max?: number;
  size?: Size;
  tone?: Tone;
  className?: string;
  /** Vị trí tuyệt đối trên góc icon… (top/right) — truyền qua style. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function CountBadge({ count, max = 99, size = 'sm', tone = 'error', className, style, accessibilityLabel }: CountBadgeProps) {
  const { family } = useFontSettings();
  if (!count || count <= 0) return null;
  const s = SIZES[size];
  const t = TONES[tone];
  const fam = resolveFontFamily(family);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      className={cn('items-center justify-center', t.box, className)}
      style={[
        {
          minWidth: s.height,
          minHeight: s.height,
          borderRadius: s.height / 2,
          paddingHorizontal: s.padX,
          paddingVertical: (s.height - s.lineHeight) / 2,
        },
        style,
      ]}
    >
      <RNText
        allowFontScaling={false}
        numberOfLines={1}
        className={t.text}
        style={{
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
          fontWeight: '700',
          textAlign: 'center',
          fontVariant: ['tabular-nums'],
          // Android: bỏ đệm font để số nằm giữa viên (iOS không có khái niệm này).
          includeFontPadding: false,
          textAlignVertical: 'center',
          ...(fam ? { fontFamily: fam } : null),
        }}
      >
        {formatBadgeCount(count, max)}
      </RNText>
    </View>
  );
}

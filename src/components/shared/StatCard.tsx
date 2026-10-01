import { View } from 'react-native';
import { Text } from '../ui/text';
import { cn } from '../ui/utils';
import { brand, colors, tileShadow } from 'src/theme';

type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info';

const BAR: Record<Tone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
};

/** Màu số qua style: Text luôn kèm class màu của tone mặc định (text-ink), class màu thứ hai thắng hay
 *  thua tuỳ thứ tự CSS — số "vắng"/"sản phẩm" từng ra màu đen. primary đọc lúc render (màu cửa hàng). */
function numberColor(tone: Tone): string {
  switch (tone) {
    case 'primary':
      return brand.primary;
    case 'success':
      return brand.success;
    case 'warning':
      return colors.warning.text as string;
    case 'error':
      return brand.error;
    default:
      return brand.info;
  }
}

export type StatCardProps = {
  value: React.ReactNode;
  label: string;
  tone?: Tone;
  className?: string;
};

/**
 * Ô số liệu nhỏ (ngày công / vắng / trễ…) kiểu "widget summary" của Minimal (bản web): thẻ trắng, vạch
 * màu nhỏ + con số theo tone, nhãn xám — thay cho ô nền màu đậm nhạt trước đây.
 */
export function StatCard({ value, label, tone = 'primary', className }: StatCardProps) {
  return (
    <View
      className={cn(
        'flex-1 rounded-2xl bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark px-3 pt-3 pb-3.5',
        className
      )}
      style={tileShadow}
    >
      <View className={cn('w-5 h-1 rounded-full', BAR[tone])} />
      <Text
        className="mt-2 text-[24px] leading-[30px] font-bold"
        style={{ color: numberColor(tone) }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text variant="label" tone="muted" className="text-[10px] mt-0.5" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

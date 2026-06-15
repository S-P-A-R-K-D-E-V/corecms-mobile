import { View } from 'react-native';
import { Text } from '../ui/text';
import { cn } from '../ui/utils';

type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info';

const toneMap: Record<Tone, { box: string; num: string }> = {
  primary: { box: 'bg-primary-50 dark:bg-[rgba(200,77,113,0.14)]', num: 'text-primary' },
  success: { box: 'bg-success-soft dark:bg-[rgba(52,199,89,0.14)]', num: 'text-success' },
  warning: { box: 'bg-warning-soft dark:bg-[rgba(255,159,10,0.14)]', num: 'text-warning' },
  error: { box: 'bg-error-soft dark:bg-[rgba(255,59,48,0.14)]', num: 'text-error' },
  info: { box: 'bg-info-soft dark:bg-[rgba(10,132,255,0.14)]', num: 'text-info' },
};

export type StatCardProps = {
  value: React.ReactNode;
  label: string;
  tone?: Tone;
  className?: string;
};

/** Compact metric tile (e.g. ngày công / vắng / trễ). */
export function StatCard({ value, label, tone = 'primary', className }: StatCardProps) {
  const t = toneMap[tone];
  return (
    <View className={cn('flex-1 items-center rounded-2xl py-3.5 gap-1', t.box, className)}>
      <Text className={cn('text-[26px] font-bold', t.num)}>{value}</Text>
      <Text variant="label" tone="muted" className="text-[9px]">{label}</Text>
    </View>
  );
}

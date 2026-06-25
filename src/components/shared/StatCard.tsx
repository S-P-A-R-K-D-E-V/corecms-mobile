import { View } from 'react-native';
import { Text } from '../ui/text';
import { cn } from '../ui/utils';

type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info';

const toneMap: Record<Tone, { box: string; num: string }> = {
  primary: { box: 'bg-primary-soft', num: 'text-primary' },
  success: { box: 'bg-success-soft', num: 'text-success' },
  warning: { box: 'bg-warning-soft', num: 'text-warning-text' },
  error: { box: 'bg-error-soft', num: 'text-error' },
  info: { box: 'bg-info-soft', num: 'text-info' },
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

import { View, type ViewProps } from 'react-native';
import { cn } from './utils';
import { softShadow } from 'src/theme';

export type CardProps = ViewProps & {
  className?: string;
  flat?: boolean;
  /** Nền kính trong suốt (chỉ dùng khi thẻ nằm trên ảnh / gradient cần nhìn xuyên). */
  glass?: boolean;
};

/**
 * Thẻ: nền ĐỤC (trắng / xám đậm) + viền mảnh + bóng mềm. Trước đây nền kính 72%: bóng elevation của Android vẽ dưới thẻ
 * lộ xuyên qua → mép thẻ xám, giữa thẻ trắng (thẻ "hai màu"). Kính thật (thanh tab / sheet) dùng GlassView.
 */
export function Card({ className, flat, glass, style, ...props }: CardProps) {
  return (
    <View
      className={cn(
        'rounded-card border',
        glass
          ? 'bg-glass-light dark:bg-glass-dark border-glass-border dark:border-glass-border-dark'
          : 'bg-surface dark:bg-surface-dark border-glass-border dark:border-glass-border-dark',
        className
      )}
      style={[flat ? undefined : softShadow, style]}
      {...props}
    />
  );
}

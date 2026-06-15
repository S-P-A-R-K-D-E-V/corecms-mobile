import { View, type ViewProps } from 'react-native';
import { cn } from './utils';
import { softShadow } from 'src/theme';

export type CardProps = ViewProps & { className?: string; flat?: boolean };

/**
 * Faux-glass surface: translucent fill + hairline border + soft Apple shadow.
 * For real frosted blur (tab bar / sheet / header) use GlassView instead.
 */
export function Card({ className, flat, style, ...props }: CardProps) {
  return (
    <View
      className={cn(
        'rounded-card border bg-glass-light dark:bg-glass-dark border-glass-border dark:border-glass-border-dark',
        className
      )}
      style={[flat ? undefined : softShadow, style]}
      {...props}
    />
  );
}

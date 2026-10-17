import { useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Card } from '../ui/card';
import { Text } from '../ui/text';
import { CountBadge } from '../ui/count-badge';
import { Pressable } from '../ui/pressable';
import { Icon, type IconName } from '../ui/icon';
import { cn } from '../ui/utils';

export type SectionCardProps = {
  title: string;
  icon?: IconName;
  count?: number;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: ViewStyle;
};

/** Card with a titled header; optionally collapsible. Replaces the ad-hoc
 *  expandable cards in the legacy check-in / schedule screens. */
export function SectionCard({
  title,
  icon,
  count,
  collapsible = false,
  defaultExpanded = true,
  right,
  children,
  className,
  bodyClassName,
  style,
}: SectionCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const open = collapsible ? expanded : true;

  const Header = (
    <View className="flex-row items-center justify-between gap-2 px-4 py-3.5">
      {/* Tiêu đề co lại (…) khi chật — chữ to theo máy không đẩy nút bên phải ra khỏi thẻ. */}
      <View className="flex-row items-center gap-2 flex-1 min-w-0">
        {icon ? <Icon name={icon} size={18} tone="primary" /> : null}
        <Text variant="subtitle" numberOfLines={1} className="flex-shrink">{title}</Text>
        {typeof count === 'number' ? <CountBadge count={count} size="md" tone="primary" /> : null}
      </View>
      {collapsible ? (
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} tone="muted" />
      ) : right ? (
        <View className="flex-shrink-0">{right}</View>
      ) : null}
    </View>
  );

  return (
    <Card className={cn('overflow-hidden', className)} style={style}>
      {collapsible ? <Pressable onPress={() => setExpanded((v) => !v)}>{Header}</Pressable> : Header}
      {open ? <View className={cn('px-4 pb-4', bodyClassName)}>{children}</View> : null}
    </Card>
  );
}

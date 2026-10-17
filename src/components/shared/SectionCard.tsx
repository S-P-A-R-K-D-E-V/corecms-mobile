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

  const titleRow = (
    <>
      {icon ? <Icon name={icon} size={18} tone="primary" /> : null}
      <Text variant="subtitle" numberOfLines={1} className="flex-shrink">{title}</Text>
      {typeof count === 'number' ? <CountBadge count={count} size="md" tone="primary" /> : null}
    </>
  );

  const Header = right && !collapsible ? (
    // Tiêu đề được ưu tiên; chật (chữ to theo máy, màn hẹp) thì cụm nút bên phải xuống dòng (canh phải) — không cắt
    // tiêu đề thành "Dùn…".
    <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-3.5">
      <View className="flex-row items-center gap-2 flex-grow" style={{ maxWidth: '100%' }}>{titleRow}</View>
      <View className="ml-auto">{right}</View>
    </View>
  ) : (
    <View className="flex-row items-center justify-between gap-2 px-4 py-3.5">
      <View className="flex-row items-center gap-2 flex-1 min-w-0">{titleRow}</View>
      {collapsible ? <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} tone="muted" /> : null}
    </View>
  );

  return (
    <Card className={cn('overflow-hidden', className)} style={style}>
      {collapsible ? <Pressable onPress={() => setExpanded((v) => !v)}>{Header}</Pressable> : Header}
      {open ? <View className={cn('px-4 pb-4', bodyClassName)}>{children}</View> : null}
    </Card>
  );
}

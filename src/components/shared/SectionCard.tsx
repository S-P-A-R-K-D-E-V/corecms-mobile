import { useState } from 'react';
import { View } from 'react-native';
import { Card } from '../ui/card';
import { Text } from '../ui/text';
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
}: SectionCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const open = collapsible ? expanded : true;

  const Header = (
    <View className="flex-row items-center justify-between px-4 py-3.5">
      <View className="flex-row items-center gap-2">
        {icon ? <Icon name={icon} size={18} tone="primary" /> : null}
        <Text variant="subtitle">{title}</Text>
        {typeof count === 'number' && count > 0 ? (
          <View className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary items-center justify-center">
            <Text className="text-white text-[10px] font-bold">{count}</Text>
          </View>
        ) : null}
      </View>
      {collapsible ? (
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} tone="muted" />
      ) : (
        right ?? null
      )}
    </View>
  );

  return (
    <Card className={cn('overflow-hidden', className)}>
      {collapsible ? <Pressable onPress={() => setExpanded((v) => !v)}>{Header}</Pressable> : Header}
      {open ? <View className={cn('px-4 pb-4', bodyClassName)}>{children}</View> : null}
    </Card>
  );
}

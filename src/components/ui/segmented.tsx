import { useState } from 'react';
import { View, Pressable, type LayoutChangeEvent } from 'react-native';
import { MotiView } from 'moti';
import { Text } from './text';
import { cn } from './utils';
import { spring } from 'src/theme/motion';
import { softShadow } from 'src/theme';
import { haptics } from 'src/services/haptics';

export type Segment = { key: string; label: string };

export type SegmentedControlProps = {
  segments: Segment[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
};

/** iOS-style segmented control với chỉ báo trượt. Dùng RN Pressable + flex:1
 *  cho từng ô để chia đều bề rộng đáng tin cậy (MotiPressable trước đây không
 *  áp flex:1 → nhãn dồn về trái, chỉ báo lệch). */
export function SegmentedControl({ segments, value, onChange, className }: SegmentedControlProps) {
  const [w, setW] = useState(0);
  const n = Math.max(1, segments.length);
  const idx = Math.max(0, segments.findIndex((s) => s.key === value));
  const segW = w > 0 ? w / n : 0;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      className={cn('flex-row rounded-2xl bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark relative', className)}
    >
      {segW > 0 ? (
        <MotiView
          animate={{ translateX: idx * segW + 4 }}
          transition={{ type: 'spring', ...spring.soft }}
          style={[{ position: 'absolute', top: 4, bottom: 4, left: 0, width: segW - 8, borderRadius: 13 }, softShadow]}
          className="bg-primary"
        />
      ) : null}
      {segments.map((s) => {
        const active = s.key === value;
        return (
          <Pressable
            key={s.key}
            onPress={() => { if (!active) { haptics.selection(); onChange(s.key); } }}
            style={{ flex: 1 }}
            className="py-2.5 items-center justify-center"
          >
            <Text variant="bodySmall" className={cn('font-semibold', active ? 'text-white' : 'text-muted')} numberOfLines={1}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

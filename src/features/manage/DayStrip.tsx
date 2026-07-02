import { View } from 'react-native';
import dayjs from 'dayjs';

import { Text, Icon, Pressable } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { haptics } from 'src/services/haptics';

// ----------------------------------------------------------------------
// Dải chọn ngày theo tuần (◀ tuần ▶ + 7 ô ngày, badge số đếm tuỳ chọn).
// Dùng chung cho các màn khu "Quản lý" (lịch đội ngũ, xếp ca, đổi ca hộ).
// ----------------------------------------------------------------------

export function DayStrip({
  weekStart,
  selected,
  onSelectDate,
  onShiftWeek,
  countByDate,
}: {
  weekStart: dayjs.Dayjs;
  selected: string;
  onSelectDate: (iso: string) => void;
  onShiftWeek: (dir: -1 | 1) => void;
  countByDate?: Record<string, number>;
}) {
  const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));
  const todayIso = dayjs().format('YYYY-MM-DD');

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => onShiftWeek(-1)} hitSlop={8} className="w-9 h-9 items-center justify-center rounded-full bg-surface dark:bg-surface-dark">
          <Icon name="chevron-left" size={20} tone="muted" />
        </Pressable>
        <Text variant="subtitle">
          {weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}
        </Text>
        <Pressable onPress={() => onShiftWeek(1)} hitSlop={8} className="w-9 h-9 items-center justify-center rounded-full bg-surface dark:bg-surface-dark">
          <Icon name="chevron-right" size={20} tone="muted" />
        </Pressable>
      </View>

      <View className="flex-row gap-1.5">
        {days.map((d) => {
          const iso = d.format('YYYY-MM-DD');
          const active = iso === selected;
          const isToday = iso === todayIso;
          const count = countByDate?.[iso] ?? 0;
          return (
            <Pressable
              key={iso}
              onPress={() => { haptics.selection(); onSelectDate(iso); }}
              className={cn(
                'flex-1 items-center rounded-2xl py-2 gap-0.5',
                active ? 'bg-primary' : 'bg-surface dark:bg-surface-dark',
                !active && isToday && 'border border-primary/40'
              )}
            >
              <Text variant="caption" className={cn('text-[10px] capitalize', active ? 'text-white/80' : 'text-muted')}>
                {d.format('dd')}
              </Text>
              <Text className={cn('text-[15px] font-bold', active ? 'text-white' : 'text-ink dark:text-white')}>
                {d.format('DD')}
              </Text>
              {countByDate ? (
                <View className={cn('min-w-[16px] h-4 px-1 rounded-full items-center justify-center', active ? 'bg-white/25' : count > 0 ? 'bg-primary-soft' : 'bg-transparent')}>
                  {count > 0 ? (
                    <Text className={cn('text-[9px] font-bold', active ? 'text-white' : 'text-primary')}>{count}</Text>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

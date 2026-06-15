import { View } from 'react-native';
import dayjs, { type Dayjs } from 'dayjs';
import isToday from 'dayjs/plugin/isToday';

import { Text, Pressable, Icon } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { DAYS_SHORT } from './constants';

dayjs.extend(isToday);

type Props = {
  weekStart: Dayjs;
  onWeekChange: (w: Dayjs) => void;
  markedDates: Set<string>;
  poolDates: Set<string>;
};

export function CalendarStrip({ weekStart, onWeekChange, markedDates, poolDates }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));
  const weekEnd = weekStart.add(6, 'day');
  const isCurrentWeek = dayjs().isBetween
    ? dayjs().isBetween(weekStart, weekEnd, 'day', '[]')
    : dayjs().isSame(weekStart, 'week');

  // month label: "Tháng 6" or "Tháng 5 – 6" if week spans two months
  const monthLabel =
    weekStart.month() !== weekEnd.month()
      ? `T${weekStart.format('M')} – T${weekEnd.format('M')} ${weekEnd.format('YYYY')}`
      : weekStart.format('MMMM YYYY');

  return (
    <View className="bg-surface dark:bg-surface-dark rounded-2xl p-3 gap-2">
      {/* Week navigator */}
      <View className="flex-row items-center justify-between px-1">
        <Pressable onPress={() => onWeekChange(weekStart.subtract(1, 'week'))} className="p-1.5 rounded-full">
          <Icon name="chevron-left" size={22} tone="primary" />
        </Pressable>

        <Pressable
          onPress={() => !isCurrentWeek && onWeekChange(dayjs().startOf('week'))}
          className="flex-row items-center gap-1.5"
        >
          <Text variant="subtitle" className="capitalize">{monthLabel}</Text>
          {!isCurrentWeek ? (
            <View className="px-1.5 py-0.5 rounded-full bg-primary/10">
              <Text className="text-[10px] text-primary font-semibold">Hôm nay</Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable onPress={() => onWeekChange(weekStart.add(1, 'week'))} className="p-1.5 rounded-full">
          <Icon name="chevron-right" size={22} tone="primary" />
        </Pressable>
      </View>

      {/* Day cells */}
      <View className="flex-row justify-around">
        {days.map((day) => {
          const key = day.format('YYYY-MM-DD');
          const today = (day as any).isToday() as boolean;
          const hasShift = markedDates.has(key);
          const hasPool = poolDates.has(key);
          return (
            <View key={key} className="items-center gap-1 min-w-[38px]">
              <Text
                variant="caption"
                className={cn('text-[11px]', today ? 'text-primary font-bold' : 'text-muted')}
              >
                {DAYS_SHORT[day.day()]}
              </Text>
              <View
                className={cn(
                  'w-8 h-8 rounded-full items-center justify-center',
                  today && 'bg-primary',
                )}
                style={today ? undefined : undefined}
              >
                <Text
                  className={cn(
                    'text-[15px]',
                    today ? 'text-white font-bold' : 'text-ink dark:text-ink-dark',
                  )}
                >
                  {day.format('D')}
                </Text>
              </View>
              {/* Dot markers */}
              <View className="flex-row gap-0.5 h-1.5">
                {hasShift ? (
                  <View className={cn('w-1.5 h-1.5 rounded-full', today ? 'bg-white/80' : 'bg-primary')} />
                ) : null}
                {hasPool ? (
                  <View className={cn('w-1.5 h-1.5 rounded-full', today ? 'bg-warning/70' : 'bg-warning')} />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

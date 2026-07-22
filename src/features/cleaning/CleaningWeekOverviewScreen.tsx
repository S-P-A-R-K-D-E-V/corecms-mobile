import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

import { Screen, AppHeader, SectionCard } from 'src/components/shared';
import { Text, Icon, Pressable } from 'src/components/ui';
import { getCleaningWeekOverview } from 'src/api/cleaning';
import type { CleaningShiftBlock, ICleaningWeekCell } from 'src/types/corecms-api';

dayjs.extend(isoWeek);

// ----------------------------------------------------------------------

const BLOCKS: CleaningShiftBlock[] = ['Morning', 'Afternoon', 'Evening'];
const BLOCK_LABEL: Record<CleaningShiftBlock, string> = { Morning: 'Sáng', Afternoon: 'Chiều', Evening: 'Tối' };

function summarize(cell?: ICleaningWeekCell): string | null {
  if (!cell) return null;
  const parts: string[] = [];
  if (cell.passedCount > 0) parts.push(`${cell.passedCount} đạt`);
  if (cell.failedCount > 0) parts.push(`${cell.failedCount} không đạt`);
  if (cell.doneCount > 0) parts.push(`${cell.doneCount} chờ chấm`);
  if (cell.pendingCount > 0) parts.push(`${cell.pendingCount} chưa làm`);
  return parts.length ? parts.join(' · ') : null;
}

function BlockRow({ block, cell }: { block: CleaningShiftBlock; cell?: ICleaningWeekCell }) {
  const summary = summarize(cell);
  return (
    <View className="py-2.5">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="font-semibold text-[13px]">{BLOCK_LABEL[block]}</Text>
        {cell?.failedCount ? (
          <View className="px-2 py-0.5 rounded-full bg-error/10">
            <Text variant="caption" tone="error" className="font-semibold">{cell.failedCount} không đạt</Text>
          </View>
        ) : null}
      </View>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {cell && cell.staffNames.length > 0 ? cell.staffNames.join(', ') : 'Chưa có ai'}
      </Text>
      {summary ? <Text variant="caption" tone="faint">{summary}</Text> : null}
    </View>
  );
}

export function CleaningWeekOverviewScreen() {
  const [weekStart, setWeekStart] = useState<Dayjs>(() => dayjs().startOf('isoWeek'));

  const fromDate = weekStart.format('YYYY-MM-DD');
  const toDate = weekStart.add(6, 'day').format('YYYY-MM-DD');

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['cleaning', 'week-overview', fromDate],
    queryFn: () => getCleaningWeekOverview(fromDate, toDate),
  });

  const cells = data ?? [];
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);

  function cellFor(day: Dayjs, block: CleaningShiftBlock) {
    const dateStr = day.format('YYYY-MM-DD');
    return cells.find((c) => c.date === dateStr && c.cleaningBlock === block);
  }

  return (
    <Screen scroll refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Theo dõi tuần vệ sinh" back />

      <View className="flex-row items-center justify-between gap-2 py-1">
        <Pressable
          onPress={() => setWeekStart((w) => w.subtract(7, 'day'))}
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-left" size={20} tone="default" />
        </Pressable>
        <Text variant="subtitle">
          {weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}
        </Text>
        <Pressable
          onPress={() => setWeekStart((w) => w.add(7, 'day'))}
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-right" size={20} tone="default" />
        </Pressable>
      </View>

      {days.map((day) => (
        <SectionCard key={day.format('YYYY-MM-DD')} title={day.format('dddd, DD/MM')} icon="calendar-today">
          <View>
            {BLOCKS.map((block, bi) => (
              <View key={block}>
                {bi > 0 ? <View className="h-px bg-line/50 dark:bg-line-dark/50" /> : null}
                <BlockRow block={block} cell={cellFor(day, block)} />
              </View>
            ))}
          </View>
        </SectionCard>
      ))}
    </Screen>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { EmptyState, ErrorView, SectionCard, Sheet } from 'src/components/shared';
import { Badge, Button, Chip, Icon, Pressable, Skeleton, Text } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { getCleaningSeries, stopCleaningSeries } from 'src/api/cleaning';
import type { ICleaningSeries } from 'src/types/corecms-api';

import { SeriesFormSheet } from './SeriesFormSheet';
import {
  BLOCKS,
  BLOCK_LABEL,
  WEEK_DAYS,
  buildDaySchedule,
  cellsSummary,
  countByDay,
  rangeLabel,
  stopDateError,
} from './schedule';
import { DateStepper } from './work-center-ui';

// ----------------------------------------------------------------------
// Lịch tuần: việc định kỳ theo thứ — chọn thứ → các ca Sáng / Chiều / Tối + "Người làm cố định". Bấm việc xem chi tiết;
// người có cleaning.template.manage thêm / sửa / dừng (từ ngày chọn). Mỗi việc là một chuỗi (GET cleaning/series).
// ----------------------------------------------------------------------

export const SERIES_KEY = (date: string) => ['work-center', 'series', date] as const;

function SeriesRow({ series, today, onPress }: { series: ICleaningSeries; today: string; onPress: () => void }) {
  const range = rangeLabel(series, today);
  const meta = [series.area, series.group, series.assigneeName].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={series.name} className="py-2.5 gap-1">
      <View className="flex-row items-center gap-2">
        <Text variant="body" className="font-semibold flex-1" numberOfLines={2}>
          {series.name}
        </Text>
        <Icon name="chevron-right" size={18} tone="muted" />
      </View>
      {meta ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-1.5">
        {!series.requiresPhoto ? <Badge tone="neutral">Không cần ảnh</Badge> : null}
        {series.autoViolation ? <Badge tone="warning">Tự ghi vi phạm</Badge> : null}
        {range ? <Badge tone="info">{range}</Badge> : null}
      </View>
    </Pressable>
  );
}

function DetailSheet({
  series,
  canEdit,
  today,
  onClose,
  onEdit,
}: {
  series: ICleaningSeries | null;
  canEdit: boolean;
  today: string;
  onClose: () => void;
  onEdit: (s: ICleaningSeries) => void;
}) {
  const qc = useQueryClient();
  const [stopping, setStopping] = useState(false);
  const [stopFrom, setStopFrom] = useState(today);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStopping(false);
    setStopFrom(today);
  }, [series, today]);

  async function stop() {
    if (!series) return;
    const error = stopDateError(stopFrom, today);
    if (error) {
      toast.warning(error);
      return;
    }
    setBusy(true);
    try {
      await stopCleaningSeries(series.seriesId, stopFrom);
      toast.success(`Đã dừng "${series.name}" từ ${dayjs(stopFrom).format('DD/MM')}`);
      qc.invalidateQueries({ queryKey: ['work-center'] });
      onClose();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa dừng được');
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = series
    ? [
        ['Nhóm', series.group || '—'],
        ['Khu', series.area || '—'],
        ['Người làm', series.assigneeName || 'Người trong ca'],
        ['Lịch', cellsSummary(series)],
        ['Ảnh', series.requiresPhoto ? 'Cần ảnh, quản lý chấm' : 'Chỉ tick "Đã làm"'],
        ['Tự ghi vi phạm', series.autoViolation ? 'Có — hết ngày chưa làm' : 'Không'],
        [
          'Hiệu lực',
          `Từ ${dayjs(series.fromDate).format('DD/MM/YYYY')}${series.toDate ? ` đến ${dayjs(series.toDate).format('DD/MM/YYYY')}` : ', không giới hạn'}`,
        ],
      ]
    : [];

  return (
    <Sheet
      visible={!!series}
      title={series?.name ?? ''}
      onClose={busy ? () => {} : onClose}
      footer={
        canEdit && series ? (
          stopping ? (
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button variant="outline" disabled={busy} onPress={() => setStopping(false)}>
                  Thôi
                </Button>
              </View>
              <View className="flex-1">
                <Button loading={busy} onPress={stop}>
                  Dừng từ {dayjs(stopFrom).format('DD/MM')}
                </Button>
              </View>
            </View>
          ) : (
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button variant="outline" icon="stop-circle-outline" onPress={() => setStopping(true)}>
                  Dừng
                </Button>
              </View>
              <View className="flex-1">
                <Button icon="pencil-outline" onPress={() => onEdit(series)}>
                  Sửa
                </Button>
              </View>
            </View>
          )
        ) : undefined
      }
    >
      <View className="gap-2">
        {rows.map(([k, v]) => (
          <View key={k} className="flex-row gap-3">
            <Text variant="caption" tone="muted" className="w-28">
              {k}
            </Text>
            <Text variant="bodySmall" className="flex-1">
              {v}
            </Text>
          </View>
        ))}
        {stopping ? (
          <View className="gap-1 pt-2">
            <DateStepper label="Dừng từ ngày" value={stopFrom} min={today} onChange={setStopFrom} />
            <Text variant="caption" tone="faint">
              Việc đã sinh mà chưa làm của ngày này trở đi sẽ bị bỏ. Lịch sử trước đó giữ nguyên.
            </Text>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

export function ScheduleTab({ canEdit }: { canEdit: boolean }) {
  const today = dayjs().format('YYYY-MM-DD');
  const [dow, setDow] = useState<number>(() => dayjs().day());
  const [selected, setSelected] = useState<ICleaningSeries | null>(null);
  const [form, setForm] = useState<{ open: boolean; editing: ICleaningSeries | null }>({ open: false, editing: null });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: SERIES_KEY(today),
    queryFn: () => getCleaningSeries(today),
  });

  const series = useMemo(() => data ?? [], [data]);
  const day = useMemo(() => buildDaySchedule(series, dow), [series, dow]);
  const counts = useMemo(() => countByDay(series), [series]);
  const sections = [
    ...BLOCKS.map((b) => ({ key: b, title: `Ca ${BLOCK_LABEL[b].toLowerCase()}`, icon: 'account-group-outline' as const, items: day[b] })),
    { key: 'fixed', title: 'Người làm cố định', icon: 'account-outline' as const, items: day.fixed },
  ];
  const empty = sections.every((s) => s.items.length === 0);

  return (
    <View className="gap-3">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {WEEK_DAYS.map((d) => (
          <Chip
            key={d.dow}
            label={`${d.short}${counts[d.dow] ? ` · ${counts[d.dow]}` : ''}`}
            size="sm"
            color="primary"
            selected={dow === d.dow}
            onPress={() => setDow(d.dow)}
          />
        ))}
      </ScrollView>

      {canEdit ? (
        <Button icon="plus" onPress={() => setForm({ open: true, editing: null })}>
          Thêm việc định kỳ
        </Button>
      ) : null}

      {isLoading ? (
        <View className="gap-3">
          <Skeleton width="100%" height={120} radius={16} />
          <Skeleton width="100%" height={120} radius={16} />
        </View>
      ) : isError ? (
        <ErrorView message={`Không tải được lịch tuần: ${extractApiError(error)}`} onRetry={refetch} />
      ) : empty ? (
        <EmptyState
          icon="calendar-blank-outline"
          title={`${WEEK_DAYS.find((d) => d.dow === dow)?.label ?? ''} chưa có việc định kỳ`}
          description={canEdit ? 'Bấm "Thêm việc định kỳ" để khai việc lặp hằng tuần.' : undefined}
        />
      ) : (
        sections
          .filter((s) => s.items.length > 0)
          .map((s) => (
            <SectionCard key={s.key} title={s.title} icon={s.icon} count={s.items.length} bodyClassName="pt-0">
              {s.items.map((item, i) => (
                <View key={item.seriesId}>
                  {i > 0 ? <View className="h-px bg-line/50 dark:bg-line-dark/50" /> : null}
                  <SeriesRow series={item} today={today} onPress={() => setSelected(item)} />
                </View>
              ))}
            </SectionCard>
          ))
      )}

      <DetailSheet
        series={selected}
        canEdit={canEdit}
        today={today}
        onClose={() => setSelected(null)}
        onEdit={(s) => {
          setSelected(null);
          // iOS không mở Modal mới khi Modal cũ đang đóng — chờ sheet chi tiết đóng xong.
          setTimeout(() => setForm({ open: true, editing: s }), 400);
        }}
      />
      <SeriesFormSheet
        visible={form.open}
        editing={form.editing}
        initialDow={dow}
        onClose={() => setForm({ open: false, editing: null })}
      />
    </View>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

import { AppHeader, EmptyState, Loading } from 'src/components/shared';
import { Text, Button, Pressable, Icon, TextField } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { toast } from 'src/components/overlay';
import { getShiftSchedules } from 'src/api/schedule';
import { registerShift, unregisterShift, getMyShiftRegistrations } from 'src/api/shiftRegistration';
import { extractApiError } from 'src/services/error';
import type { IShiftSchedule, IShiftRegistration } from 'src/types/corecms-api';

dayjs.extend(isoWeek);

// Chiều cao pill tab bar nổi (đồng bộ PILL_H trong src/app/(tabs)/_layout.tsx)
const TAB_PILL_H = 72;

const DAY_BITMASK = [64, 1, 2, 4, 8, 16, 32]; // JS getDay(): 0=Sun
const VI_DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const PALETTE = ['#7C3AED', '#2563EB', '#0891B2', '#059669', '#D97706'];

const key = (scheduleId: string, date: string) => `${scheduleId}_${date}`;

function isScheduleOnDate(s: IShiftSchedule, date: dayjs.Dayjs): boolean {
  const d = date.format('YYYY-MM-DD');
  const from = s.fromDate.split('T')[0];
  const to = s.toDate ? s.toDate.split('T')[0] : '9999-12-31';
  if (d < from || d > to) return false;
  return (s.repeatDays & DAY_BITMASK[date.day()]) !== 0;
}

export function RegisterShiftScreen() {
  const insets = useSafeAreaInsets();
  const today = dayjs().startOf('day');
  const [weekStart, setWeekStart] = useState(() => dayjs().isoWeekday(1).startOf('day'));
  const [schedules, setSchedules] = useState<IShiftSchedule[]>([]);
  const [registrations, setRegistrations] = useState<IShiftRegistration[]>([]);
  const [selections, setSelections] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const weekEnd = weekStart.add(6, 'day');
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setSelections({});
    try {
      const from = weekStart.format('YYYY-MM-DD');
      const to = weekEnd.format('YYYY-MM-DD');
      const [sched, regs] = await Promise.all([getShiftSchedules(from, to), getMyShiftRegistrations(from, to)]);
      setSchedules(sched.filter((s) => s.isActive).sort((a, b) => a.startTime.localeCompare(b.startTime)));
      setRegistrations(regs);
      const initial: Record<string, boolean> = {};
      regs.forEach((r) => { initial[key(r.shiftScheduleId, r.date.split('T')[0])] = true; });
      setSelections(initial);
    } catch {
      toast.error('Không tải được dữ liệu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const registeredKeys = useMemo(() => {
    const k = new Set<string>();
    registrations.forEach((r) => k.add(key(r.shiftScheduleId, r.date.split('T')[0])));
    return k;
  }, [registrations]);

  const changes = useMemo(() => {
    let toReg = 0, toUnreg = 0;
    days.forEach((day) => {
      const d = day.format('YYYY-MM-DD');
      schedules.forEach((s) => {
        if (!isScheduleOnDate(s, day)) return;
        const k = key(s.id, d);
        const sel = !!selections[k];
        const was = registeredKeys.has(k);
        if (sel && !was) toReg++;
        else if (!sel && was) toUnreg++;
      });
    });
    return { toReg, toUnreg, total: toReg + toUnreg };
  }, [days, schedules, selections, registeredKeys]);

  async function handleSubmit() {
    if (changes.total === 0) return;
    setSubmitting(true);
    try {
      const toRegister: { shiftScheduleId: string; date: string }[] = [];
      const toUnregister: { shiftScheduleId: string; date: string }[] = [];
      days.forEach((day) => {
        const d = day.format('YYYY-MM-DD');
        schedules.forEach((s) => {
          if (!isScheduleOnDate(s, day)) return;
          if (!dayjs().isBefore(dayjs(`${d}T${(s.startTime || '00:00').slice(0, 5)}`))) return;
          const k = key(s.id, d);
          const sel = !!selections[k];
          const was = registeredKeys.has(k);
          if (sel && !was) toRegister.push({ shiftScheduleId: s.id, date: d });
          else if (!sel && was) toUnregister.push({ shiftScheduleId: s.id, date: d });
        });
      });
      await Promise.all([
        ...toRegister.map((r) => registerShift({ ...r, note: note.trim() || undefined })),
        ...toUnregister.map((r) => unregisterShift(r)),
      ]);
      const msg = [toRegister.length > 0 ? `Đăng ký ${toRegister.length} ca` : '', toUnregister.length > 0 ? `Huỷ ${toUnregister.length} ca` : ''].filter(Boolean).join(', ');
      toast.success(`${msg} thành công!`);
      await loadData();
    } catch (err: any) {
      toast.error(extractApiError(err), 'Thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View
      className="flex-1 bg-bg dark:bg-bg-dark"
      style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) + TAB_PILL_H + 12 }}
    >
      <View className="px-4 pt-2">
        <AppHeader title="Đăng ký lịch tuần" back />
      </View>

      {/* Week nav */}
      <View className="flex-row items-center justify-between px-5 py-2 border-y border-line dark:border-line-dark bg-surface dark:bg-surface-dark">
        <Pressable onPress={() => setWeekStart((w) => w.subtract(7, 'day'))} className="p-1"><Icon name="chevron-left" size={24} /></Pressable>
        <Text variant="subtitle">{weekStart.format('DD-MM')} — {weekEnd.format('DD/MM/YYYY')}</Text>
        <Pressable onPress={() => setWeekStart((w) => w.add(7, 'day'))} className="p-1"><Icon name="chevron-right" size={24} /></Pressable>
      </View>

      {loading ? (
        <Loading />
      ) : schedules.length === 0 ? (
        <EmptyState icon="calendar-blank-outline" title="Không có lịch ca nào trong tuần này" />
      ) : (
        <ScrollView contentContainerClassName="p-3 gap-1">
          {days.map((day) => {
            const d = day.format('YYYY-MM-DD');
            const isToday = day.isSame(today, 'day');
            const isPast = day.isBefore(today, 'day');
            const daySchedules = schedules.filter((s) => isScheduleOnDate(s, day));
            return (
              <View key={d} className={cn('flex-row items-center gap-2.5 py-2.5 border-b border-line/60 dark:border-line-dark', isPast && 'opacity-40')}>
                <View className="w-10 items-center gap-0.5">
                  <View className={cn('w-8 h-8 rounded-full items-center justify-center', isToday && 'bg-primary')}>
                    <Text className={cn('text-sm font-bold', isToday ? 'text-white' : 'text-ink dark:text-ink-dark')}>{day.format('D')}</Text>
                  </View>
                  <Text className={cn('text-[10px]', isToday ? 'text-primary font-bold' : 'text-muted')}>{VI_DAYS[day.day()]}</Text>
                </View>
                <View className="flex-1 flex-row gap-1.5 flex-wrap">
                  {daySchedules.length === 0 ? (
                    <Text tone="muted" className="self-center">—</Text>
                  ) : daySchedules.map((s, idx) => {
                    const k = key(s.id, d);
                    const sel = !!selections[k];
                    const color = (s.color && s.color !== '#000000') ? s.color : PALETTE[idx % PALETTE.length];
                    return (
                      <Pressable
                        key={s.id}
                        disabled={isPast}
                        onPress={() => setSelections((p) => ({ ...p, [k]: !p[k] }))}
                        className="flex-1 min-w-[72px] min-h-[52px] rounded-xl items-center justify-center px-1.5 py-2"
                        style={{ backgroundColor: sel ? color : `${color}18`, borderWidth: sel ? 0 : 0 }}
                      >
                        <Text numberOfLines={1} className="text-[11px] font-bold" style={{ color: sel ? '#fff' : color }}>{s.templateName}</Text>
                        <Text numberOfLines={1} className="text-[9px] mt-0.5" style={{ color: sel ? '#fff' : color, opacity: 0.85 }}>{s.startTime}-{s.endTime}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}

          <View className="mt-3">
            <TextField
              placeholder="Ghi chú (tùy chọn)"
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={200}
              className="min-h-[44px]"
            />
          </View>
          <View className="h-4" />
        </ScrollView>
      )}

      {/* Footer */}
      {!loading && schedules.length > 0 ? (
        <View className="p-3 pb-4 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark gap-2">
          {changes.total > 0 ? (
            <View className="flex-row gap-3 justify-center">
              {changes.toReg > 0 ? <Text variant="bodySmall" tone="success" className="font-semibold">+{changes.toReg} đăng ký</Text> : null}
              {changes.toUnreg > 0 ? <Text variant="bodySmall" tone="error" className="font-semibold">-{changes.toUnreg} huỷ</Text> : null}
            </View>
          ) : null}
          <Button icon="calendar-check" loading={submitting} disabled={changes.total === 0} onPress={handleSubmit}>
            {changes.total > 0 ? 'Lưu thay đổi' : 'Chưa có thay đổi'}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

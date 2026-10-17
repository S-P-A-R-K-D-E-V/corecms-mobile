import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

import { AppHeader, EmptyState, Loading } from 'src/components/shared';
import { Text, Button, Pressable, Icon, TextField } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { toast } from 'src/components/overlay';
import { getShiftSchedules } from 'src/api/schedule';
import { registerShift, unregisterShift, getMyShiftRegistrations, getRegistrationLock, type RegistrationLock } from 'src/api/shiftRegistration';
import { extractApiError } from 'src/services/error';
import type { IShiftSchedule, IShiftRegistration } from 'src/types/corecms-api';

dayjs.extend(isoWeek);

const DAY_BITMASK = [64, 1, 2, 4, 8, 16, 32]; // JS getDay(): 0=Sun
const VI_DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const VI_FULL_DAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const PALETTE = ['#7C3AED', '#2563EB', '#0891B2', '#059669', '#D97706'];

const key = (scheduleId: string, date: string) => `${scheduleId}_${date}`;

/** " · còn 5 giờ" / " · còn 40 phút" khi hạn đăng ký còn dưới 48 giờ (để nhân viên kịp đăng ký). */
function deadlineLeft(lockAt: string): string {
  const minutes = dayjs(lockAt).diff(dayjs(), 'minute');
  if (minutes <= 0 || minutes >= 48 * 60) return '';
  return minutes < 60 ? ` · còn ${minutes} phút` : ` · còn ${Math.floor(minutes / 60)} giờ`;
}

/** Bố cục trang đăng ký: 'grid' (bảng tuần) khi ≤ 4 ca và chữ thường; 'days' (dải ngày + danh sách) khi ≥ 5 ca hoặc chữ to. */
export function registerLayout(shiftCount: number, fontScale: number): 'grid' | 'days' {
  return shiftCount >= 5 || fontScale > 1.3 ? 'days' : 'grid';
}

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
  const [lock, setLock] = useState<RegistrationLock | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const weekEnd = weekStart.add(6, 'day');
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);
  const weekHasToday = !today.isBefore(weekStart, 'day') && !today.isAfter(weekEnd, 'day');
  const shownDays = weekHasToday ? days.filter((d) => !d.isBefore(today, 'day')) : days;
  const hiddenPast = days.length - shownDays.length;
  const locked = !!lock?.isLocked;

  // Bố cục theo số ca: ≤ 4 ca → bảng tuần (thấy cả tuần, chọn nhanh); ≥ 5 ca hoặc máy để chữ to → dải ngày + danh sách
  // ca (bao nhiêu ca cũng vừa, vùng bấm lớn). Hai dạng dùng chung lựa chọn / khoá / nút lưu.
  const { fontScale } = useWindowDimensions();
  const dayListMode = registerLayout(schedules.length, fontScale) === 'days';
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const activeDay = shownDays.find((d) => d.format('YYYY-MM-DD') === focusDay) ?? shownDays[0];

  const shiftColor = (sc: IShiftSchedule) => {
    const idx = schedules.indexOf(sc);
    return sc.color && sc.color !== '#000000' ? sc.color : PALETTE[Math.max(0, idx) % PALETTE.length];
  };
  // Ca đã bắt đầu không đăng ký / huỷ được nữa (lúc lưu cũng bỏ qua) — khoá luôn trên màn cho khỏi bấm nhầm.
  const canToggle = (sc: IShiftSchedule, day: dayjs.Dayjs) =>
    !locked &&
    !day.isBefore(today, 'day') &&
    isScheduleOnDate(sc, day) &&
    dayjs().isBefore(dayjs(`${day.format('YYYY-MM-DD')}T${(sc.startTime || '00:00').slice(0, 5)}`));
  const toggle = (k: string) => setSelections((p) => ({ ...p, [k]: !p[k] }));
  /** "Cả tuần": chọn ca này cho mọi ngày còn đăng ký được trong tuần (đã chọn hết thì bỏ hết). */
  const toggleWeek = (sc: IShiftSchedule) => {
    const eligible = shownDays.filter((day) => canToggle(sc, day)).map((day) => key(sc.id, day.format('YYYY-MM-DD')));
    const all = eligible.length > 0 && eligible.every((k) => selections[k]);
    setSelections((p) => {
      const next = { ...p };
      eligible.forEach((k) => { next[k] = !all; });
      return next;
    });
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setSelections({});
    setFocusDay(null);
    try {
      const from = weekStart.format('YYYY-MM-DD');
      const to = weekEnd.format('YYYY-MM-DD');
      const [sched, regs, lk] = await Promise.all([
        getShiftSchedules(from, to),
        getMyShiftRegistrations(from, to),
        // Không đọc được mốc chốt (máy chủ cũ / lỗi) thì vẫn cho đăng ký như trước.
        getRegistrationLock(from).catch(() => null),
      ]);
      setLock(lk);
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
      style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) }}
    >
      <View className="px-4 pt-2">
        {/* Mở từ Điểm danh (khác tab) đôi khi không còn history để back() —
            luôn đảm bảo thoát được: back nếu có history, nếu không thì về Lịch làm. */}
        <AppHeader
          title="Đăng ký lịch tuần"
          back
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/schedule'))}
        />
      </View>

      {/* Week nav */}
      <View className="flex-row items-center justify-between px-5 py-2 border-y border-line dark:border-line-dark bg-surface dark:bg-surface-dark">
        <Pressable onPress={() => setWeekStart((w) => w.subtract(7, 'day'))} className="p-1"><Icon name="chevron-left" size={24} /></Pressable>
        <Text variant="subtitle">{weekStart.format('DD/MM')} – {weekEnd.format('DD/MM/YYYY')}</Text>
        <Pressable onPress={() => setWeekStart((w) => w.add(7, 'day'))} className="p-1"><Icon name="chevron-right" size={24} /></Pressable>
      </View>

      {loading ? (
        <Loading />
      ) : schedules.length === 0 ? (
        <EmptyState icon="calendar-blank-outline" title="Không có lịch ca nào trong tuần này" />
      ) : (
        <ScrollView contentContainerClassName="p-3 gap-1">
          {/* Hạn chót / đã chốt đăng ký của tuần */}
          {lock ? (
            <View className={cn('flex-row items-center gap-2 px-3 py-2.5 rounded-xl mb-1', locked ? 'bg-warning-soft' : 'bg-info-soft')}>
              <Icon name={locked ? 'lock-outline' : 'clock-outline'} size={18} tone={locked ? 'warning' : 'primary'} />
              <Text variant="bodySmall" tone={locked ? 'warning' : 'primary'} className="flex-1 font-semibold">
                {locked
                  ? `Tuần này đã chốt đăng ký lúc ${dayjs(lock.lockAt).format('HH:mm DD/MM')}. Cần đổi ca? Dùng Đổi ca hoặc Chợ ca.`
                  : `Hạn đăng ký: ${dayjs(lock.lockAt).format('HH:mm')}, ${VI_DAYS[dayjs(lock.lockAt).day()]} ${dayjs(lock.lockAt).format('DD/MM')}${deadlineLeft(lock.lockAt)}`}
              </Text>
            </View>
          ) : null}
          {hiddenPast > 0 ? (
            <Text variant="caption" tone="muted" className="px-1 pb-1">Đã ẩn {hiddenPast} ngày đã qua của tuần này.</Text>
          ) : null}
          {dayListMode ? (
            // ── Dạng B: dải ngày + danh sách ca của ngày đang chọn ──
            <View className="gap-2">
              <View className="flex-row gap-1">
                {shownDays.map((day) => {
                  const d = day.format('YYYY-MM-DD');
                  const active = !!activeDay && day.isSame(activeDay, 'day');
                  const count = schedules.filter((sc) => selections[key(sc.id, d)]).length;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setFocusDay(d)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      className={cn('flex-1 items-center py-1.5 rounded-xl', active ? 'bg-primary' : 'bg-surface dark:bg-surface-dark')}
                    >
                      <Text className={cn('text-[10px]', active ? 'text-white' : 'text-muted')}>{VI_DAYS[day.day()]}</Text>
                      <Text className={cn('text-[15px] font-bold', active ? 'text-white' : 'text-ink dark:text-ink-dark')}>{day.format('D')}</Text>
                      <View className={cn('min-w-[16px] h-4 px-1 mt-0.5 rounded-full items-center justify-center', count ? (active ? 'bg-white/25' : 'bg-primary-soft') : '')}>
                        {count ? <Text className={cn('text-[10px] font-bold', active ? 'text-white' : 'text-primary')}>{count}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {activeDay ? (() => {
                const d = activeDay.format('YYYY-MM-DD');
                const daySchedules = schedules.filter((sc) => isScheduleOnDate(sc, activeDay));
                return (
                  <>
                    <Text variant="caption" tone="muted" className="px-1 mt-1">
                      {VI_FULL_DAYS[activeDay.day()]} {activeDay.format('DD/MM')} · {daySchedules.length} ca
                    </Text>
                    {daySchedules.length === 0 ? (
                      <Text tone="muted" className="text-center py-6">Ngày này không có ca</Text>
                    ) : (
                      daySchedules.map((sc) => {
                        const k = key(sc.id, d);
                        const sel = !!selections[k];
                        const color = shiftColor(sc);
                        const enabled = canToggle(sc, activeDay);
                        const weekKeys = shownDays.filter((day) => canToggle(sc, day)).map((day) => key(sc.id, day.format('YYYY-MM-DD')));
                        const allWeek = weekKeys.length > 0 && weekKeys.every((wk) => selections[wk]);
                        return (
                          <Pressable
                            key={sc.id}
                            disabled={!enabled}
                            onPress={() => toggle(k)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: sel, disabled: !enabled }}
                            accessibilityLabel={`${sc.templateName} ${sc.startTime}–${sc.endTime}`}
                            className={cn('flex-row items-center gap-3 px-3 py-3 rounded-2xl bg-surface dark:bg-surface-dark', !enabled && 'opacity-50')}
                          >
                            <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color }} />
                            <View className="flex-1 min-w-0">
                              <Text variant="bodySmall" className="font-semibold" numberOfLines={1}>{sc.templateName}</Text>
                              <Text variant="caption" tone="muted">{sc.startTime}–{sc.endTime}</Text>
                            </View>
                            {weekKeys.length > 1 ? (
                              <Pressable onPress={() => toggleWeek(sc)} hitSlop={6} className="px-2 py-1 rounded-lg bg-primary-soft">
                                <Text className="text-[11px] font-semibold text-primary">{allWeek ? 'Bỏ cả tuần' : 'Cả tuần'}</Text>
                              </Pressable>
                            ) : null}
                            <View
                              className="w-7 h-7 rounded-lg items-center justify-center"
                              style={sel ? { backgroundColor: color } : { borderWidth: 1.5, borderColor: '#C4CDD5' }}
                            >
                              {sel ? <Icon name="check" size={16} color="#FFFFFF" /> : null}
                            </View>
                          </Pressable>
                        );
                      })
                    )}
                  </>
                );
              })() : null}
            </View>
          ) : (
            // ── Dạng A: bảng tuần — tên + giờ ca ghi một lần ở đầu cột, ô chỉ còn dấu tích ──
            <View className={cn('gap-1.5', locked && 'opacity-60')}>
              <View className="flex-row gap-1.5 items-end pb-1">
                <View className="w-11" />
                {schedules.map((sc) => (
                  <View key={sc.id} className="flex-1 items-center">
                    <Text numberOfLines={1} className="text-[12px] font-bold" style={{ color: shiftColor(sc) }}>{sc.templateName}</Text>
                    <Text numberOfLines={1} tone="muted" className="text-[10px]">{sc.startTime}–{sc.endTime}</Text>
                  </View>
                ))}
              </View>
              {shownDays.map((day) => {
                const d = day.format('YYYY-MM-DD');
                const isToday = day.isSame(today, 'day');
                return (
                  <View key={d} className="flex-row gap-1.5 items-center">
                    <View className="w-11 items-center">
                      <View className={cn('w-8 h-8 rounded-full items-center justify-center', isToday && 'bg-primary')}>
                        <Text className={cn('text-sm font-bold', isToday ? 'text-white' : 'text-ink dark:text-ink-dark')}>{day.format('D')}</Text>
                      </View>
                      <Text className={cn('text-[10px]', isToday ? 'text-primary font-bold' : 'text-muted')}>{VI_DAYS[day.day()]}</Text>
                    </View>
                    {schedules.map((sc) => {
                      if (!isScheduleOnDate(sc, day)) {
                        return (
                          <View key={sc.id} className="flex-1 h-11 items-center justify-center">
                            <Text tone="faint">—</Text>
                          </View>
                        );
                      }
                      const k = key(sc.id, d);
                      const sel = !!selections[k];
                      const color = shiftColor(sc);
                      const enabled = canToggle(sc, day);
                      return (
                        <Pressable
                          key={sc.id}
                          disabled={!enabled}
                          onPress={() => toggle(k)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: sel, disabled: !enabled }}
                          accessibilityLabel={`${sc.templateName} ${VI_DAYS[day.day()]} ${day.format('DD/MM')}`}
                          className={cn('flex-1 h-11 rounded-xl items-center justify-center', !enabled && 'opacity-40')}
                          style={{ backgroundColor: sel ? color : `${color}1F` }}
                        >
                          {sel ? <Icon name="check" size={18} color="#FFFFFF" /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          )}

          {/* Đã chốt: không đổi được gì — bỏ ô ghi chú. */}
          {locked ? null : (
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
          )}
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
            {changes.total > 0 ? 'Lưu thay đổi' : locked ? 'Đã chốt đăng ký' : 'Chạm vào ca để đăng ký'}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

import { useMemo, useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';

import { Screen, AppHeader, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Icon, Pressable, Skeleton, Divider, Avatar } from 'src/components/ui';
import { haptics } from 'src/services/haptics';
import { getStorageUrl } from 'src/api/axios';
import type { IShiftAssignment } from 'src/types/corecms-api';

import { useAllStaff, useTeamAssignments } from './hooks';
import { DayStrip } from './DayStrip';
import { AdjustAttendanceSheet } from './AdjustAttendanceSheet';
import { deriveStatus, type AssignmentStatus } from './utils';

dayjs.locale('vi');

// ----------------------------------------------------------------------
// Lịch đội ngũ (Manager/Admin): xem ca của MỌI nhân viên theo tuần — chọn
// ngày trên dải 7 ngày, danh sách gom theo ca (giờ bắt đầu → tên ca → NV).
// Avatar lấy từ danh sách nhân viên (assignment không trả avatar). Chạm 1 NV
// để điều chỉnh chấm công. Trạng thái suy từ attendanceLog.
// ----------------------------------------------------------------------

const STATUS_META: Record<AssignmentStatus, { tone: 'info' | 'success' | 'error' | 'warning'; label: string }> = {
  Scheduled: { tone: 'info', label: 'Đã xếp' },
  Present: { tone: 'success', label: 'Có mặt' },
  Absent: { tone: 'error', label: 'Vắng' },
  Late: { tone: 'warning', label: 'Muộn' },
};

// Số nhân viên tối thiểu (đã chấm công vào) để coi 1 ca là "đông bất thường".
const OVERLAP_WARN_THRESHOLD = 3;

function ShiftGroup({
  title,
  time,
  items,
  avatarOf,
  onPick,
}: {
  title: string;
  time: string;
  items: IShiftAssignment[];
  avatarOf: (staffId: string) => string | null;
  onPick: (a: IShiftAssignment) => void;
}) {
  const checkedInCount = items.filter((a) => a.attendanceLog?.checkInTime).length;
  const overstaffed = checkedInCount >= OVERLAP_WARN_THRESHOLD;
  return (
    <Card className="p-4 gap-1">
      <View className="flex-row items-center gap-2 mb-1">
        <Icon name="clock-outline" size={16} tone="primary" />
        <Text variant="subtitle" className="flex-1">{title}</Text>
        <Text variant="caption" tone="muted">{time}</Text>
      </View>
      {overstaffed ? (
        <View className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-warning-soft mb-1">
          <Icon name="account-alert-outline" size={14} tone="warning" />
          <Text variant="caption" tone="warning" className="font-semibold flex-1">
            Cảnh báo: {checkedInCount} nhân viên đã chấm công vào ca này (≥ {OVERLAP_WARN_THRESHOLD}).
          </Text>
        </View>
      ) : null}
      {items.map((a, i) => {
        const meta = STATUS_META[deriveStatus(a)];
        return (
          <View key={a.id}>
            {i > 0 ? <Divider /> : null}
            <Pressable onPress={() => onPick(a)} className="flex-row items-center gap-3 py-2">
              <Avatar name={a.staffName} uri={avatarOf(a.staffId)} size={36} />
              <View className="flex-1">
                <Text variant="bodySmall" className="font-medium">{a.staffName}</Text>
                {a.attendanceLog?.checkInTime ? (
                  <Text variant="caption" tone="muted">
                    Vào {dayjs(a.attendanceLog.checkInTime).format('HH:mm')}
                    {a.attendanceLog.checkOutTime ? ` · Ra ${dayjs(a.attendanceLog.checkOutTime).format('HH:mm')}` : ''}
                  </Text>
                ) : a.note ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>{a.note}</Text>
                ) : null}
              </View>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <Icon name="pencil-outline" size={16} tone="faint" />
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}

export function TeamScheduleScreen() {
  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));
  const [selected, setSelected] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [adjusting, setAdjusting] = useState<IShiftAssignment | null>(null);

  const fromDate = weekStart.format('YYYY-MM-DD');
  const toDate = weekStart.add(6, 'day').format('YYYY-MM-DD');
  const { data, isLoading, isError, refetch, isFetching } = useTeamAssignments(fromDate, toDate);
  const staffQ = useAllStaff();

  // Map staffId → URL avatar (assignment không kèm avatar).
  const avatarByStaff = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of staffQ.data ?? []) {
      const uri = getStorageUrl(u.avatarUrl || u.profileImageUrl);
      if (uri) map.set(u.id, uri);
    }
    return map;
  }, [staffQ.data]);
  const avatarOf = (staffId: string) => avatarByStaff.get(staffId) ?? null;

  // Số ca mỗi ngày (badge trên dải ngày) + nhóm ca của ngày đang chọn.
  const { countByDate, groups } = useMemo(() => {
    const counts: Record<string, number> = {};
    const byShift = new Map<string, { title: string; time: string; items: IShiftAssignment[] }>();
    for (const a of data ?? []) {
      const dateIso = dayjs(a.date).format('YYYY-MM-DD');
      counts[dateIso] = (counts[dateIso] ?? 0) + 1;
      if (dateIso !== selected) continue;
      const key = `${a.startTime}-${a.shiftName}`;
      if (!byShift.has(key)) {
        byShift.set(key, {
          title: a.shiftName,
          time: `${a.startTime} – ${a.endTime}`,
          items: [],
        });
      }
      byShift.get(key)!.items.push(a);
    }
    const sorted = [...byShift.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
    return { countByDate: counts, groups: sorted };
  }, [data, selected]);

  function shiftWeek(dir: -1 | 1) {
    haptics.light();
    const next = weekStart.add(dir, 'week');
    setWeekStart(next);
    setSelected(next.format('YYYY-MM-DD'));
  }

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Lịch đội ngũ" subtitle="Chạm nhân viên để điều chỉnh chấm công" back />

      <DayStrip
        weekStart={weekStart}
        selected={selected}
        onSelectDate={setSelected}
        onShiftWeek={shiftWeek}
        countByDate={countByDate}
      />

      {isLoading ? (
        <View className="gap-3">
          {[0, 1].map((i) => (
            <Card key={i} className="p-4 gap-3">
              <Skeleton width={160} height={16} />
              <Skeleton width="100%" height={40} radius={10} />
              <Skeleton width="100%" height={40} radius={10} />
            </Card>
          ))}
        </View>
      ) : isError ? (
        <ErrorView onRetry={refetch} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="calendar-blank-outline"
          title="Không có ca nào"
          description={`Chưa có nhân viên nào được xếp ca ngày ${dayjs(selected).format('DD/MM')}.`}
        />
      ) : (
        groups.map((g) => (
          <ShiftGroup key={`${g.time}-${g.title}`} title={g.title} time={g.time} items={g.items} avatarOf={avatarOf} onPick={setAdjusting} />
        ))
      )}

      <AdjustAttendanceSheet
        target={
          adjusting
            ? {
                shiftAssignmentId: adjusting.id,
                staffId: adjusting.staffId,
                staffName: adjusting.staffName,
                shiftName: adjusting.shiftName,
                date: dayjs(adjusting.date).format('YYYY-MM-DD'),
                startTime: adjusting.startTime,
                endTime: adjusting.endTime,
                checkInTime: adjusting.attendanceLog?.checkInTime,
                checkOutTime: adjusting.attendanceLog?.checkOutTime,
              }
            : null
        }
        visible={!!adjusting}
        onClose={() => setAdjusting(null)}
      />
    </Screen>
  );
}

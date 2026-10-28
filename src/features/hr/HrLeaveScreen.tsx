import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Sheet, ToggleRow } from 'src/components/shared';
import { Text, Button, Badge, TextField, Pressable } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { getMySchedule } from 'src/api/schedule';
import { cancelShiftLeave, createShiftLeave, getMyShiftLeaves } from 'src/api/hr';
import { SHIFT_LEAVE_STATUS_LABEL, type IShiftLeave, type ShiftLeaveStatus } from 'src/types/hr';
import type { IMyScheduleItem } from 'src/types/corecms-api';
import { hoursUntilShift, leaveCandidates } from './hr-rules';
import { useActiveHrRules } from './hooks';

// ----------------------------------------------------------------------
// Xin nghỉ một ca đã xếp: báo trước theo luật của cửa hàng (trống = không yêu cầu); ốm đau / việc gia đình khẩn cấp thì đánh dấu khẩn
// cấp và ghi rõ lý do. Đơn được duyệt thì ca được gỡ khỏi lịch, không tính vắng.
// ----------------------------------------------------------------------

const STATUS_TONE: Record<ShiftLeaveStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'error',
  Cancelled: 'neutral',
};

const shiftLabel = (date: string, name: string, start: string, end: string) =>
  `${name} · ${dayjs(date).format('dd DD/MM')} · ${start.slice(0, 5)}–${end.slice(0, 5)}`;

function LeaveCard({ leave, onCancel }: { leave: IShiftLeave; onCancel: () => void }) {
  return (
    <SectionCard
      title={shiftLabel(leave.shiftDate, leave.shiftName, leave.startTime, leave.endTime)}
      right={<Badge tone={STATUS_TONE[leave.status]}>{SHIFT_LEAVE_STATUS_LABEL[leave.status]}</Badge>}
      bodyClassName="pt-0 gap-1.5"
    >
      <Text variant="bodySmall">{leave.reason}</Text>
      <View className="flex-row gap-1.5">
        {leave.isEmergency ? <Badge tone="error">Khẩn cấp</Badge> : null}
        {leave.isLateNotice ? <Badge tone="warning">Báo muộn</Badge> : null}
      </View>
      {leave.reviewNote ? <Text variant="caption" tone="muted">Ghi chú duyệt: {leave.reviewNote}</Text> : null}
      {leave.status === 'Pending' ? (
        <Button size="sm" variant="outline" action="neutral" onPress={onCancel}>
          Huỷ đơn
        </Button>
      ) : null}
    </SectionCard>
  );
}

function CreateSheet({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const noticeHours = useActiveHrRules()?.leaveMinNoticeHours ?? null;
  const [picked, setPicked] = useState<IMyScheduleItem | null>(null);
  const [reason, setReason] = useState('');
  const [emergency, setEmergency] = useState(false);
  const [busy, setBusy] = useState(false);

  const today = dayjs().format('YYYY-MM-DD');
  const to = dayjs().add(45, 'day').format('YYYY-MM-DD');
  const schedule = useQuery({
    queryKey: ['schedule', 'mine', today, to],
    queryFn: () => getMySchedule(today, to),
    enabled: visible,
  });
  const shifts = useMemo(() => leaveCandidates(schedule.data ?? []), [schedule.data]);
  const lateNotice = !!picked && noticeHours != null && hoursUntilShift(picked.date, picked.startTime) < noticeHours;

  function close() {
    setPicked(null);
    setReason('');
    setEmergency(false);
    onClose();
  }

  async function submit() {
    if (!picked) return;
    setBusy(true);
    try {
      await createShiftLeave({ shiftAssignmentId: picked.assignmentId, reason: reason.trim(), isEmergency: emergency });
      toast.success('Đã gửi đơn — chờ duyệt.');
      setPicked(null);
      setReason('');
      setEmergency(false);
      onDone();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa gửi được đơn');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Xin nghỉ ca"
      onClose={busy ? () => {} : close}
      footer={
        <Button loading={busy} disabled={busy || !picked || !reason.trim() || (lateNotice && !emergency)} onPress={submit}>
          {lateNotice && !emergency ? `Dưới ${noticeHours} giờ — cần đánh dấu khẩn cấp` : 'Gửi đơn'}
        </Button>
      }
    >
      <View className="gap-3">
        <Text variant="caption" tone="muted">Chọn ca muốn nghỉ (45 ngày tới, chưa chấm công).</Text>
        {schedule.isLoading ? <Text variant="bodySmall" tone="muted">Đang tải lịch…</Text> : null}
        {!schedule.isLoading && shifts.length === 0 ? (
          <Text variant="bodySmall" tone="muted">Bạn không có ca nào sắp tới.</Text>
        ) : null}
        {shifts.map((s) => {
          const selected = picked?.assignmentId === s.assignmentId;
          return (
            <Pressable
              key={s.assignmentId}
              onPress={() => setPicked(s)}
              className={`rounded-xl border px-3 py-2.5 ${selected ? 'border-primary bg-primary-soft' : 'border-line dark:border-line-dark'}`}
            >
              <Text variant="bodySmall" className={selected ? 'font-semibold' : undefined} tone={selected ? 'primary' : 'default'}>
                {shiftLabel(s.date, s.shiftName, s.startTime, s.endTime)}
              </Text>
            </Pressable>
          );
        })}
        {lateNotice ? (
          <Text variant="caption" tone="warning" className="font-semibold">
            Còn dưới {noticeHours} giờ tới giờ ca. Chỉ xin được khi ốm đau hoặc việc gia đình khẩn cấp — đánh dấu khẩn cấp và ghi rõ lý do.
          </Text>
        ) : null}
        <TextField label="Lý do" placeholder="Vd: ốm, việc gia đình…" value={reason} onChangeText={setReason} multiline />
        <ToggleRow
          icon="alert-outline"
          title="Khẩn cấp"
          description="Ốm đau, việc gia đình đột xuất"
          value={emergency}
          onToggle={setEmergency}
        />
      </View>
    </Sheet>
  );
}

export function HrLeaveScreen() {
  const qc = useQueryClient();
  const noticeHours = useActiveHrRules()?.leaveMinNoticeHours ?? null;
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ['hr', 'leave'], queryFn: getMyShiftLeaves });
  const list = query.data ?? [];

  async function cancel(leave: IShiftLeave) {
    try {
      await cancelShiftLeave(leave.id);
      toast.success('Đã huỷ đơn.');
      qc.invalidateQueries({ queryKey: ['hr', 'leave'] });
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa huỷ được');
    }
  }

  return (
    <Screen scroll refreshing={query.isFetching} onRefresh={query.refetch}>
      <AppHeader title="Xin nghỉ ca" back />
      <Text variant="caption" tone="muted">
        {noticeHours ? `Xin nghỉ ca đã xếp phải báo trước ít nhất ${noticeHours} giờ và được duyệt.` : 'Xin nghỉ ca đã xếp cần được duyệt.'} Được duyệt thì ca được gỡ khỏi lịch, không tính vắng.
      </Text>
      <Button icon="calendar-remove-outline" onPress={() => setCreating(true)}>
        Xin nghỉ một ca
      </Button>

      {query.isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được đơn: {extractApiError(query.error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
        </View>
      ) : !query.isLoading && list.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted">Chưa có đơn nào.</Text>
        </View>
      ) : (
        list.map((l) => <LeaveCard key={l.id} leave={l} onCancel={() => cancel(l)} />)
      )}

      <CreateSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onDone={() => {
          setCreating(false);
          qc.invalidateQueries({ queryKey: ['hr', 'leave'] });
        }}
      />
    </Screen>
  );
}

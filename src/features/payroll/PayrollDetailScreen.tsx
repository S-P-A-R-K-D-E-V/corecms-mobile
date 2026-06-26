import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Loading, ErrorView } from 'src/components/shared';
import { Text, Badge, Divider, BrandGradient, CountUp, Donut } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { softShadow, brand } from 'src/theme';
import type { IPayrollShiftItem } from 'src/types/corecms-api';
import { useMyPayroll, usePayrollShiftDetails, fmtMoney } from './hooks';

function Row({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'success' | 'error' }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text tone="muted">{label}</Text>
      <Text className="font-semibold" tone={tone === 'success' ? 'success' : tone === 'error' ? 'error' : 'default'}>{value}</Text>
    </View>
  );
}

// Mini ô thống kê công (tổng / có mặt / vắng / …).
function Metric({ value, label, tone }: { value: React.ReactNode; label: string; tone: 'primary' | 'success' | 'error' | 'warning' | 'info' }) {
  const numCls: Record<string, string> = {
    primary: 'text-primary', success: 'text-success', error: 'text-error', warning: 'text-warning-text', info: 'text-info',
  };
  return (
    <View className="items-center" style={{ minWidth: 64 }}>
      <Text className={cn('text-xl font-bold', numCls[tone])} style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text variant="caption" tone="muted" className="text-center">{label}</Text>
    </View>
  );
}

// Giờ "HH:mm" từ chuỗi BE "yyyy-MM-dd HH:mm:ss".
function timePart(s?: string): string {
  if (!s) return '--';
  const part = s.includes(' ') ? s.split(' ')[1] : s;
  return part?.slice(0, 5) || '--';
}

// Nhãn trạng thái ca — khớp logic core-fe (my-payroll).
function shiftStatus(s: IPayrollShiftItem): { label: string; tone: 'info' | 'warning' | 'success' | 'error' } {
  if (s.isWaived) return { label: 'Đã bỏ qua lỗi', tone: 'info' };
  if (s.status === 'Present' && s.lateMinutes > 0) return { label: `Đi muộn ${s.lateMinutes}p`, tone: 'warning' };
  if (s.status === 'Present') return { label: 'Có mặt', tone: 'success' };
  if (s.status === 'Wrong') return { label: 'Sai ca', tone: 'error' };
  return { label: 'Vắng', tone: 'error' };
}

export function PayrollDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: records } = useMyPayroll();
  const rec = records?.find((r) => r.id === id);
  const { data: details, isLoading, isError, refetch } = usePayrollShiftDetails(id!);

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader title="Chi tiết lương" subtitle={rec?.periodMonth} back />

      {rec ? (
        <BrandGradient className="rounded-card p-5 gap-1" style={softShadow}>
          <Text className="text-white/70 text-xs">Thực nhận kỳ này</Text>
          <CountUp className="text-white text-3xl font-bold" value={rec.totalSalary} format={(n) => fmtMoney(Math.round(n))} />
          <Text className="text-white/70 text-xs mt-1">
            {dayjs(rec.fromDate).format('DD/MM')} – {dayjs(rec.toDate).format('DD/MM/YYYY')}
            {rec.isFinalized ? '  ·  Đã duyệt' : '  ·  Tạm tính'}
          </Text>
        </BrandGradient>
      ) : null}

      {rec ? (
        <SectionCard title="Tổng quan công" icon="calendar-check" bodyClassName="pt-0">
          <View className="flex-row flex-wrap justify-between gap-y-3 py-1">
            <Metric value={rec.totalShifts} label="Tổng ca" tone="primary" />
            <Metric value={rec.presentShifts} label="Có mặt" tone="success" />
            <Metric value={rec.absentShifts} label="Vắng" tone="error" />
            <Metric value={rec.wrongShifts} label="Sai ca" tone="warning" />
            <Metric value={`${rec.totalLateMinutes}p`} label="Đi muộn" tone="warning" />
            <Metric value={`${rec.totalHoursWorked.toFixed(1)}h`} label="Giờ làm" tone="info" />
          </View>
        </SectionCard>
      ) : null}

      {rec ? (
        <SectionCard title="Cơ cấu lương" icon="chart-donut" bodyClassName="pt-0">
          <View className="flex-row items-center gap-4 py-1">
            <Donut
              size={130}
              stroke={20}
              segments={[
                { value: rec.baseSalary, color: brand.primary },
                { value: rec.overtimeSalary, color: brand.secondary },
                { value: rec.bonus, color: brand.success },
              ]}
            >
              <Text variant="caption" tone="muted">Tổng</Text>
              <Text variant="subtitle" tone="primary" style={{ fontVariant: ['tabular-nums'] }}>{fmtMoney(rec.totalSalary)}</Text>
            </Donut>
            <View className="flex-1 gap-2.5">
              {[
                { label: 'Lương cơ bản', value: rec.baseSalary, color: brand.primary },
                { label: 'Tăng ca', value: rec.overtimeSalary, color: brand.secondary },
                { label: 'Thưởng lễ', value: rec.bonus, color: brand.success },
              ].map((s) => (
                <View key={s.label} className="flex-row items-center gap-2">
                  <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color }} />
                  <Text variant="bodySmall" tone="muted" className="flex-1">{s.label}</Text>
                  <Text variant="bodySmall" className="font-semibold" style={{ fontVariant: ['tabular-nums'] }}>{fmtMoney(s.value)}</Text>
                </View>
              ))}
            </View>
          </View>
        </SectionCard>
      ) : null}

      {rec ? (
        <SectionCard title="Chi tiết khoản" bodyClassName="pt-0">
          <Row label="Lương cơ bản" value={fmtMoney(rec.baseSalary)} />
          <Divider />
          <Row label="Lương tăng ca" value={fmtMoney(rec.overtimeSalary)} />
          <Divider />
          <Row label="Thưởng lễ" value={fmtMoney(rec.bonus)} tone="success" />
          <Divider />
          <Row label="Khấu trừ" value={`- ${fmtMoney(rec.deduction)}`} tone="error" />
          <Divider />
          <Row label="Tiền phạt" value={`- ${fmtMoney(rec.penaltyAmount)}`} tone="error" />
          <Divider />
          <View className="flex-row items-center justify-between pt-2">
            <Text className="font-bold">Tổng thực nhận</Text>
            <Text className="font-bold text-lg text-primary">{fmtMoney(rec.totalSalary)}</Text>
          </View>
        </SectionCard>
      ) : null}

      <SectionCard title="Chi tiết ca làm" icon="calendar-clock" bodyClassName="pt-0">
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <ErrorView onRetry={refetch} />
        ) : !details || details.shifts.length === 0 ? (
          <Text tone="muted" className="text-center py-4">Không có dữ liệu ca</Text>
        ) : (
          details.shifts.map((s, i) => {
            const st = shiftStatus(s);
            return (
              <View key={s.shiftAssignmentId || `${s.date}-${i}`}>
                {i > 0 ? <Divider className="my-1" /> : null}
                <View className="py-2 gap-1">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-1.5 flex-1">
                      <Text className="font-semibold" numberOfLines={1}>{s.shiftName}</Text>
                      {s.isHolidayShift ? <Badge tone="warning">Lễ</Badge> : null}
                    </View>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </View>
                  <Text variant="bodySmall" tone="muted">
                    {dayjs(s.date).format('DD/MM')} · {s.shiftStartTime}–{s.shiftEndTime}
                    {s.paidHours > 0 ? ` · ${s.paidHours.toFixed(1)}h tính lương` : ''}
                  </Text>
                  {s.checkInTime || s.checkOutTime ? (
                    <Text variant="caption" tone="faint">
                      Vào {timePart(s.checkInTime)} · Ra {timePart(s.checkOutTime)}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </SectionCard>
    </Screen>
  );
}

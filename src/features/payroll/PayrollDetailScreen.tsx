import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Loading, ErrorView } from 'src/components/shared';
import { Text, Badge, Divider, BrandGradient, CountUp, Donut } from 'src/components/ui';
import { softShadow, brand } from 'src/theme';
import { useMyPayroll, usePayrollShiftDetails, fmtMoney } from './hooks';

function Row({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'success' | 'error' }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text tone="muted">{label}</Text>
      <Text className="font-semibold" tone={tone === 'success' ? 'success' : tone === 'error' ? 'error' : 'default'}>{value}</Text>
    </View>
  );
}

export function PayrollDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: records } = useMyPayroll();
  const rec = records?.find((r) => r.id === id);
  const { data: details, isLoading, isError, refetch } = usePayrollShiftDetails(id!);

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader title="Chi tiết lương" subtitle={rec?.cycleName} back />

      {rec ? (
        <BrandGradient className="rounded-card p-5 gap-1" style={softShadow}>
          <Text className="text-white/70 text-xs">Thực nhận kỳ này</Text>
          <CountUp className="text-white text-3xl font-bold" value={rec.totalSalary} format={(n) => fmtMoney(Math.round(n))} />
          <Text className="text-white/70 text-xs mt-1">
            {dayjs(rec.periodStart).format('DD/MM')} – {dayjs(rec.periodEnd).format('DD/MM/YYYY')}
          </Text>
        </BrandGradient>
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
                { label: 'Thưởng', value: rec.bonus, color: brand.success },
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
          <Row label="Thưởng" value={fmtMoney(rec.bonus)} tone="success" />
          <Divider />
          <Row label="Khấu trừ" value={`- ${fmtMoney(rec.deductions)}`} tone="error" />
          <Divider />
          <Row label="Phạt" value={`- ${fmtMoney(rec.penaltyAmount)}`} tone="error" />
          <Divider />
          <View className="flex-row items-center justify-between pt-2">
            <Text className="font-bold">Tổng thực nhận</Text>
            <Text className="font-bold text-lg text-primary">{fmtMoney(rec.totalSalary)}</Text>
          </View>
        </SectionCard>
      ) : null}

      <SectionCard title="Chi tiết ca làm" bodyClassName="pt-0">
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <ErrorView onRetry={refetch} />
        ) : !details || details.shifts.length === 0 ? (
          <Text tone="muted" className="text-center py-4">Không có dữ liệu ca</Text>
        ) : (
          details.shifts.map((s, i) => (
            <View key={`${s.date}-${i}`}>
              {i > 0 ? <Divider className="my-1" /> : null}
              <View className="py-2 gap-1">
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold">{s.shiftName}</Text>
                  <Badge tone={s.isLate ? 'warning' : 'success'}>{s.isLate ? `Trễ ${s.lateMinutes}p` : 'Đúng giờ'}</Badge>
                </View>
                <Text variant="bodySmall" tone="muted">
                  {dayjs(s.date).format('DD/MM')} · {s.scheduledStart}–{s.scheduledEnd} · {s.hoursWorked}h
                  {s.overtimeHours > 0 ? ` · OT ${s.overtimeHours}h` : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </SectionCard>
    </Screen>
  );
}

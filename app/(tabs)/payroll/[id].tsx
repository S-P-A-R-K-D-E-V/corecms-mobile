import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Card, Divider, useTheme, ActivityIndicator, DataTable } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';

import { getMyPayroll, getPayrollShiftDetails } from 'src/api/payroll';
import type { IPayrollRecord, IPayrollShiftDetailResponse } from 'src/types/corecms-api';

// ----------------------------------------------------------------------

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function Row({ label, value, valueStyle }: { label: string; value: string; valueStyle?: any }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text variant="bodyMedium" style={{ color: '#637381', flex: 1 }}>{label}</Text>
      <Text variant="bodyMedium" style={[{ fontWeight: '600' }, valueStyle]}>{value}</Text>
    </View>
  );
}

// ----------------------------------------------------------------------

export default function PayrollDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [record, setRecord] = useState<IPayrollRecord | null>(null);
  const [details, setDetails] = useState<IPayrollShiftDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [all, det] = await Promise.all([
          getMyPayroll(),
          getPayrollShiftDetails(id),
        ]);
        setRecord(all.find((r) => r.id === id) ?? null);
        setDetails(det);
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading || !record) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <Card style={[styles.card, { backgroundColor: theme.colors.primary }]}>
          <Card.Content style={{ alignItems: 'center', paddingVertical: 20 }}>
            <Text variant="titleMedium" style={{ color: 'rgba(255,255,255,0.8)' }}>{record.cycleName}</Text>
            <Text variant="displaySmall" style={{ color: '#fff', fontWeight: 'bold', marginTop: 4 }}>
              {formatCurrency(record.totalSalary)}
            </Text>
            <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
              {dayjs(record.periodStart).format('DD/MM')} – {dayjs(record.periodEnd).format('DD/MM/YYYY')}
            </Text>
          </Card.Content>
        </Card>

        {/* Salary Breakdown */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Title title="Chi tiết lương" titleVariant="titleMedium" />
          <Card.Content style={{ gap: 10 }}>
            <Row label="Lương cơ bản" value={formatCurrency(record.baseSalary)} />
            <Divider />
            <Row
              label="Lương tăng ca"
              value={formatCurrency(record.overtimeSalary)}
              valueStyle={{ color: '#00B8D9' }}
            />
            <Row
              label="Thưởng"
              value={formatCurrency(record.bonus)}
              valueStyle={{ color: '#00A76F' }}
            />
            <Divider />
            <Row
              label="Phạt"
              value={`- ${formatCurrency(record.penaltyAmount)}`}
              valueStyle={{ color: '#FF5630' }}
            />
            <Row
              label="Khấu trừ khác"
              value={`- ${formatCurrency(record.deductions)}`}
              valueStyle={{ color: '#FF5630' }}
            />
            <Divider style={{ borderColor: theme.colors.primary, borderWidth: 1 }} />
            <Row
              label="TỔNG NHẬN"
              value={formatCurrency(record.totalSalary)}
              valueStyle={{ color: '#00A76F', fontSize: 16 }}
            />
          </Card.Content>
        </Card>

        {/* Attendance Summary */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Title title="Tổng quan chấm công" titleVariant="titleMedium" />
          <Card.Content style={{ gap: 8 }}>
            <Row label="Ca được xếp" value={`${record.totalShiftsScheduled} ca`} />
            <Row
              label="Ca đi làm"
              value={`${record.totalShiftsPresent} ca`}
              valueStyle={{ color: '#00A76F' }}
            />
            <Row
              label="Ca vắng"
              value={`${record.totalShiftsAbsent} ca`}
              valueStyle={{ color: '#FF5630' }}
            />
            <Row
              label="Giờ làm việc"
              value={`${record.totalHoursWorked.toFixed(1)} giờ`}
            />
            <Row
              label="Giờ tăng ca"
              value={`${record.totalOvertimeHours.toFixed(1)} giờ`}
              valueStyle={{ color: '#00B8D9' }}
            />
          </Card.Content>
        </Card>

        {/* Shift Detail Table */}
        {details && details.shifts.length > 0 && (
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Title title="Chi tiết từng ca" titleVariant="titleMedium" />
            <DataTable>
              <DataTable.Header>
                <DataTable.Title>Ngày</DataTable.Title>
                <DataTable.Title>Ca</DataTable.Title>
                <DataTable.Title numeric>Giờ</DataTable.Title>
                <DataTable.Title numeric>Trạng thái</DataTable.Title>
              </DataTable.Header>
              {details.shifts.map((shift, i) => (
                <DataTable.Row key={i}>
                  <DataTable.Cell>{dayjs(shift.date).format('DD/MM')}</DataTable.Cell>
                  <DataTable.Cell>{shift.shiftName}</DataTable.Cell>
                  <DataTable.Cell numeric>{shift.hoursWorked.toFixed(1)}</DataTable.Cell>
                  <DataTable.Cell numeric>
                    <Text
                      variant="bodySmall"
                      style={{
                        color:
                          shift.status === 'Present' ? '#00A76F' :
                          shift.status === 'Absent' ? '#FF5630' :
                          '#FFAB00',
                        fontWeight: '600',
                      }}
                    >
                      {shift.status === 'Present' ? 'Có mặt' :
                       shift.status === 'Absent' ? 'Vắng' : 'Trễ'}
                    </Text>
                  </DataTable.Cell>
                </DataTable.Row>
              ))}
            </DataTable>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 16 },
  card: { borderRadius: 16, overflow: 'hidden', elevation: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

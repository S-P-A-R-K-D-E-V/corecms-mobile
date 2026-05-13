import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, Card, Chip, useTheme, ActivityIndicator, Surface, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import dayjs from 'dayjs';

import { getMyPayroll } from 'src/api/payroll';
import type { IPayrollRecord } from 'src/types/corecms-api';

// ----------------------------------------------------------------------

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function StatusChip({ status }: { status: IPayrollRecord['status'] }) {
  const isFinalized = status === 'Finalized';
  return (
    <Chip
      compact
      style={{ backgroundColor: isFinalized ? '#00A76F20' : '#FFAB0020' }}
      textStyle={{ color: isFinalized ? '#00A76F' : '#FFAB00', fontSize: 11, fontWeight: '600' }}
    >
      {isFinalized ? 'Đã chốt' : 'Nháp'}
    </Chip>
  );
}

function PayrollCard({ record, onPress }: { record: IPayrollRecord; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} onPress={onPress}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{record.cycleName}</Text>
            <Text variant="bodySmall" style={{ color: '#637381', marginTop: 2 }}>
              {dayjs(record.periodStart).format('DD/MM')} – {dayjs(record.periodEnd).format('DD/MM/YYYY')}
            </Text>
          </View>
          <StatusChip status={record.status} />
        </View>

        <Divider style={{ marginVertical: 12 }} />

        {/* Summary stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text variant="labelSmall" style={{ color: '#637381' }}>Số ca</Text>
            <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
              {record.totalShiftsPresent}/{record.totalShiftsScheduled}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text variant="labelSmall" style={{ color: '#637381' }}>OT (giờ)</Text>
            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: '#00B8D9' }}>
              {record.totalOvertimeHours.toFixed(1)}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text variant="labelSmall" style={{ color: '#637381' }}>Phạt</Text>
            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: '#FF5630' }}>
              {formatCurrency(record.penaltyAmount)}
            </Text>
          </View>
        </View>

        <Divider style={{ marginVertical: 12 }} />

        {/* Total */}
        <View style={styles.totalRow}>
          <Text variant="bodyMedium" style={{ color: '#637381' }}>Tổng nhận</Text>
          <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#00A76F' }}>
            {formatCurrency(record.totalSalary)}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
}

// ----------------------------------------------------------------------

export default function PayrollScreen() {
  const theme = useTheme();
  const [records, setRecords] = useState<IPayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getMyPayroll();
      setRecords(data.sort((a, b) => dayjs(b.periodStart).diff(dayjs(a.periodStart))));
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Summary card
  const latestFinalized = records.find((r) => r.status === 'Finalized');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
        }
        ListHeaderComponent={
          latestFinalized ? (
            <Surface style={[styles.summaryBanner, { backgroundColor: theme.colors.primary }]} elevation={2}>
              <Text variant="labelMedium" style={{ color: 'rgba(255,255,255,0.8)' }}>
                KỲ LƯƠNG GẦN NHẤT — {latestFinalized.cycleName}
              </Text>
              <Text variant="displaySmall" style={{ color: '#fff', fontWeight: 'bold', marginTop: 4 }}>
                {formatCurrency(latestFinalized.totalSalary)}
              </Text>
              <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                {latestFinalized.totalShiftsPresent} ca đi làm
                {' · '}Chốt {latestFinalized.finalizedAt ? dayjs(latestFinalized.finalizedAt).format('DD/MM/YYYY') : '—'}
              </Text>
            </Surface>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 40 }}>💰</Text>
            <Text variant="bodyMedium" style={{ color: '#637381', marginTop: 8 }}>
              Chưa có dữ liệu lương
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <PayrollCard
            record={item}
            onPress={() => router.push({ pathname: '/(tabs)/payroll/[id]', params: { id: item.id } })}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, gap: 0 },
  summaryBanner: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
  },
  card: { borderRadius: 16, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 2 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
});

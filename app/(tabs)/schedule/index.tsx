import { useState, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, FlatList,
} from 'react-native';
import { Text, Card, Chip, Button, Surface, useTheme, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import dayjs, { Dayjs } from 'dayjs';
import isToday from 'dayjs/plugin/isToday';

dayjs.extend(isToday);

import { getMySchedule } from 'src/api/schedule';
import { getMyShiftRegistrations } from 'src/api/shiftRegistration';
import type { IShiftAssignment, IShiftRegistration } from 'src/types/corecms-api';

// ----------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  Scheduled: '#00B8D9',
  Present: '#00A76F',
  Absent: '#FF5630',
  Late: '#FFAB00',
  Pending: '#FF8F00',
  Approved: '#00A76F',
  Rejected: '#FF5630',
};

const DAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// ── Custom Calendar Strip ──────────────────────────────────────────────

function CalendarStrip({
  selectedDate,
  onSelectDate,
  markedDates,
}: {
  selectedDate: string;
  onSelectDate: (d: string) => void;
  markedDates: Set<string>;
}) {
  const theme = useTheme();
  const [weekStart, setWeekStart] = useState<Dayjs>(
    dayjs(selectedDate).startOf('week')
  );

  const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));

  return (
    <Card style={[styles.calCard, { backgroundColor: theme.colors.surface }]}>
      {/* Month header + navigation */}
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => setWeekStart((w) => w.subtract(1, 'week'))} hitSlop={12}>
          <Text style={{ fontSize: 22, color: theme.colors.primary, paddingHorizontal: 8 }}>‹</Text>
        </TouchableOpacity>
        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
          {weekStart.format('MMMM YYYY')}
        </Text>
        <TouchableOpacity onPress={() => setWeekStart((w) => w.add(1, 'week'))} hitSlop={12}>
          <Text style={{ fontSize: 22, color: theme.colors.primary, paddingHorizontal: 8 }}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day cells */}
      <View style={styles.daysRow}>
        {days.map((day) => {
          const key = day.format('YYYY-MM-DD');
          const isSelected = key === selectedDate;
          const isToday = day.isToday();
          const hasShift = markedDates.has(key);

          return (
            <TouchableOpacity
              key={key}
              onPress={() => onSelectDate(key)}
              style={[
                styles.dayCell,
                isSelected && { backgroundColor: theme.colors.primary, borderRadius: 12 },
              ]}
              activeOpacity={0.7}
            >
              <Text
                variant="labelSmall"
                style={{
                  color: isSelected ? 'rgba(255,255,255,0.8)' : theme.colors.onSurfaceVariant,
                  marginBottom: 2,
                }}
              >
                {DAYS_SHORT[day.day()]}
              </Text>
              <Text
                variant="titleSmall"
                style={{
                  fontWeight: isSelected || isToday ? 'bold' : '400',
                  color: isSelected ? '#fff' : isToday ? theme.colors.primary : theme.colors.onSurface,
                }}
              >
                {day.format('D')}
              </Text>
              {hasShift && (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: isSelected ? 'rgba(255,255,255,0.9)' : theme.colors.primary },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Today button */}
      <TouchableOpacity
        onPress={() => {
          const today = dayjs().format('YYYY-MM-DD');
          setWeekStart(dayjs().startOf('week'));
          onSelectDate(today);
        }}
        style={styles.todayBtn}
      >
        <Text variant="labelSmall" style={{ color: theme.colors.primary }}>Hôm nay</Text>
      </TouchableOpacity>
    </Card>
  );
}

// ── Shift Cards ────────────────────────────────────────────────────────

function ShiftCard({ item }: { item: IShiftAssignment }) {
  const theme = useTheme();
  const color = STATUS_COLORS[item.status] ?? '#637381';
  return (
    <Surface style={[styles.shiftCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={[styles.shiftBar, { backgroundColor: color }]} />
      <View style={styles.shiftBody}>
        <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>{item.shiftTemplateName}</Text>
        <Text variant="bodySmall" style={{ color: '#637381' }}>{item.startTime} – {item.endTime}</Text>
        <Chip compact style={{ backgroundColor: `${color}18`, alignSelf: 'flex-start', marginTop: 4 }}
          textStyle={{ color, fontSize: 11, fontWeight: '600' }}>
          {item.status}
        </Chip>
      </View>
    </Surface>
  );
}

function RegCard({ item }: { item: IShiftRegistration }) {
  const theme = useTheme();
  const color = STATUS_COLORS[item.status] ?? '#637381';
  const label = item.status === 'Pending' ? 'Chờ duyệt' : item.status === 'Approved' ? 'Đã duyệt' : 'Từ chối';
  return (
    <Surface style={[styles.shiftCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={[styles.shiftBar, { backgroundColor: color }]} />
      <View style={styles.shiftBody}>
        <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>{item.shiftTemplateName}</Text>
        <Text variant="bodySmall" style={{ color: '#637381' }}>{item.startTime} – {item.endTime}</Text>
        <Chip compact style={{ backgroundColor: `${color}18`, alignSelf: 'flex-start', marginTop: 4 }}
          textStyle={{ color, fontSize: 11, fontWeight: '600' }}>
          {label}
        </Chip>
      </View>
    </Surface>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const theme = useTheme();
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [assignments, setAssignments] = useState<IShiftAssignment[]>([]);
  const [registrations, setRegistrations] = useState<IShiftRegistration[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const startOfMonth = dayjs(selectedDate).subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
  const endOfMonth = dayjs(selectedDate).add(1, 'month').endOf('month').format('YYYY-MM-DD');

  const loadData = useCallback(async () => {
    try {
      const [sched, regs] = await Promise.all([
        getMySchedule(startOfMonth, endOfMonth),
        getMyShiftRegistrations(startOfMonth, endOfMonth),
      ]);
      setAssignments(sched);
      setRegistrations(regs);
    } catch {}
  }, [startOfMonth, endOfMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const markedDates = new Set<string>([
    ...assignments.map((a) => a.date),
    ...registrations.map((r) => r.date),
  ]);

  const dayAssignments = assignments.filter((a) => a.date === selectedDate);
  const dayRegistrations = registrations.filter((r) => r.date === selectedDate);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        <CalendarStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          markedDates={markedDates}
        />

        <View style={styles.registerRow}>
          <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
            {dayjs(selectedDate).format('DD/MM/YYYY')}
          </Text>
          <Button
            mode="contained" compact icon="plus"
            onPress={() => router.push({ pathname: '/(tabs)/schedule/register', params: { date: selectedDate } })}
            style={{ borderRadius: 10 }}
          >
            Đăng ký ca
          </Button>
        </View>

        <View style={styles.daySection}>
          {dayAssignments.length > 0 && (
            <>
              <Text variant="labelMedium" style={{ color: '#637381', marginBottom: 8 }}>CA ĐƯỢC XẾP</Text>
              {dayAssignments.map((a) => <ShiftCard key={a.id} item={a} />)}
            </>
          )}

          {dayRegistrations.length > 0 && (
            <>
              {dayAssignments.length > 0 && <Divider style={{ marginVertical: 12 }} />}
              <Text variant="labelMedium" style={{ color: '#637381', marginBottom: 8 }}>CA ĐÃ ĐĂNG KÝ</Text>
              {dayRegistrations.map((r) => <RegCard key={r.id} item={r} />)}
            </>
          )}

          {dayAssignments.length === 0 && dayRegistrations.length === 0 && (
            <View style={styles.empty}>
              <Text style={{ fontSize: 36 }}>📅</Text>
              <Text variant="bodyMedium" style={{ color: '#637381', marginTop: 8 }}>Không có ca làm việc ngày này</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  calCard: { margin: 16, borderRadius: 16, paddingVertical: 12, elevation: 1 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 4 },
  dayCell: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, minWidth: 40 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  todayBtn: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingTop: 8 },
  registerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 12,
  },
  daySection: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  shiftCard: { flexDirection: 'row', borderRadius: 12, overflow: 'hidden', marginBottom: 4 },
  shiftBar: { width: 5 },
  shiftBody: { flex: 1, padding: 12 },
  empty: { alignItems: 'center', paddingVertical: 32 },
});

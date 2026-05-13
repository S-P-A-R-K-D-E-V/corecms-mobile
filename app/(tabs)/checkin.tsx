import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { Text, Card, Button, Chip, Divider, useTheme, ActivityIndicator, Surface } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import dayjs from 'dayjs';

import { smartCheckIn, smartCheckOut, getMyAttendanceLogs } from 'src/api/attendance';
import { useAuthContext } from 'src/auth/auth-context';
import type { IAttendanceLog } from 'src/types/corecms-api';

function formatTime(iso?: string | null) {
  if (!iso) return '--:--';
  return dayjs(iso).format('HH:mm');
}

function StatusChip({ status }: { status: IAttendanceLog['status'] }) {
  const map: Record<IAttendanceLog['status'], { label: string; color: string }> = {
    CheckedIn: { label: 'Đang làm việc', color: '#00A76F' },
    CheckedOut: { label: 'Đã check-out', color: '#637381' },
    AutoClosed: { label: 'Tự động đóng', color: '#FFAB00' },
  };
  const info = map[status];
  return (
    <Chip style={{ backgroundColor: `${info.color}20` }} textStyle={{ color: info.color, fontSize: 12, fontWeight: '600' }}>
      {info.label}
    </Chip>
  );
}

export default function CheckInScreen() {
  const { user } = useAuthContext();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<IAttendanceLog[]>([]);
  const [activeLog, setActiveLog] = useState<IAttendanceLog | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const data = await getMyAttendanceLogs(today, today);
      setLogs(data);
      setActiveLog(data.find((l) => l.status === 'CheckedIn') ?? null);
    } catch {}
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
  }, [loadLogs]);

  async function getCoords() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return loc.coords;
  }

  async function handleCheckIn() {
    setLoading(true);
    try {
      const coords = await getCoords();
      await smartCheckIn({ latitude: coords?.latitude, longitude: coords?.longitude });
      Alert.alert('Thành công', 'Check-in thành công!');
      await loadLogs();
    } catch (err: any) {
      Alert.alert('Check-in thất bại', err?.message || 'Vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckOut() {
    Alert.alert('Xác nhận', 'Bạn có muốn check-out không?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Check-out', style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            const coords = await getCoords();
            await smartCheckOut({ latitude: coords?.latitude, longitude: coords?.longitude });
            Alert.alert('Thành công', 'Check-out thành công!');
            await loadLogs();
          } catch (err: any) {
            Alert.alert('Check-out thất bại', err?.message || 'Vui lòng thử lại');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  const isCheckedIn = !!activeLog;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        <View style={styles.headerSection}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {dayjs().format('dddd, DD/MM/YYYY')}
          </Text>
          <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginTop: 2 }}>
            Xin chào, {user?.firstName} 👋
          </Text>
        </View>

        <Surface style={[styles.mainCard, { backgroundColor: isCheckedIn ? '#00A76F' : theme.colors.primary }]} elevation={3}>
          <View style={styles.mainCardContent}>
            <Text variant="titleMedium" style={{ color: '#fff', opacity: 0.85, marginBottom: 4 }}>
              {isCheckedIn ? 'Đang làm việc' : 'Chưa check-in'}
            </Text>
            {isCheckedIn && (
              <>
                <Text variant="displaySmall" style={{ color: '#fff', fontWeight: 'bold', marginBottom: 4 }}>
                  {formatTime(activeLog.checkInTime)}
                </Text>
                <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  Check-in lúc {formatTime(activeLog.checkInTime)}
                  {activeLog.isLate ? ` · Trễ ${activeLog.lateMinutes} phút` : ' · Đúng giờ'}
                </Text>
              </>
            )}
            <Button
              mode="contained"
              onPress={isCheckedIn ? handleCheckOut : handleCheckIn}
              loading={loading}
              disabled={loading}
              buttonColor={isCheckedIn ? '#FF5630' : '#fff'}
              textColor={isCheckedIn ? '#fff' : theme.colors.primary}
              style={styles.checkButton}
              contentStyle={{ paddingVertical: 8 }}
              labelStyle={{ fontSize: 17, fontWeight: 'bold' }}
              icon={isCheckedIn ? 'logout' : 'fingerprint'}
            >
              {isCheckedIn ? 'Check-out' : 'Check-in'}
            </Button>
          </View>
        </Surface>

        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Title title="Lịch sử hôm nay" titleVariant="titleMedium" />
          <Card.Content>
            {logs.length === 0 ? (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 16 }}>
                Chưa có dữ liệu điểm danh hôm nay
              </Text>
            ) : (
              logs.map((log, index) => (
                <View key={log.id}>
                  {index > 0 && <Divider style={{ marginVertical: 12 }} />}
                  <View style={styles.logTimes}>
                    <View style={styles.timeBlock}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>CHECK-IN</Text>
                      <Text variant="titleMedium" style={{ fontWeight: 'bold', color: '#00A76F' }}>{formatTime(log.checkInTime)}</Text>
                    </View>
                    <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 20 }}>→</Text>
                    <View style={styles.timeBlock}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>CHECK-OUT</Text>
                      <Text variant="titleMedium" style={{ fontWeight: 'bold', color: '#FF5630' }}>{formatTime(log.checkOutTime)}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <StatusChip status={log.status} />
                    {log.isLate && <Text variant="bodySmall" style={{ color: '#FFAB00' }}>Trễ {log.lateMinutes} phút</Text>}
                  </View>
                </View>
              ))
            )}
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 16 },
  headerSection: { marginBottom: 4 },
  mainCard: { borderRadius: 20, overflow: 'hidden' },
  mainCardContent: { padding: 28, alignItems: 'center', gap: 4 },
  checkButton: { marginTop: 20, borderRadius: 14, minWidth: 180, elevation: 2 },
  card: { borderRadius: 16, elevation: 1 },
  logTimes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  timeBlock: { alignItems: 'center', gap: 2 },
});

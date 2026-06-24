import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader, EmptyState, Loading, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Appear } from 'src/components/ui';
import { getMyAttendanceRequests } from 'src/api/attendance';
import type { IAttendanceRequest } from 'src/types/corecms-api';

const TYPE_LABEL: Record<IAttendanceRequest['type'], string> = {
  LeaveRequest: 'Xin nghỉ phép',
  AdjustCheckIn: 'Điều chỉnh giờ vào',
  AdjustCheckOut: 'Điều chỉnh giờ ra',
};

const STATUS: Record<IAttendanceRequest['status'], { label: string; tone: 'warning' | 'success' | 'error' }> = {
  Pending: { label: 'Chờ duyệt', tone: 'warning' },
  Approved: { label: 'Đã duyệt', tone: 'success' },
  Rejected: { label: 'Từ chối', tone: 'error' },
};

export function AttendanceListScreen() {
  const [items, setItems] = useState<IAttendanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await getMyAttendanceRequests();
      setItems(data.sort((a, b) => dayjs(b.createdAt).diff(dayjs(a.createdAt))));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  return (
    <Screen scroll tabBarInset={false} refreshing={refreshing} onRefresh={onRefresh}>
      <AppHeader
        title="Yêu cầu chấm công"
        back
        actions={[{ icon: 'plus', onPress: () => router.push('/attendance/new') }]}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorView onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="clipboard-text-outline"
          title="Chưa có yêu cầu nào"
          description="Tạo yêu cầu nghỉ phép hoặc điều chỉnh giờ vào/ra."
          actionLabel="Tạo yêu cầu"
          onAction={() => router.push('/attendance/new')}
        />
      ) : (
        items.map((req, i) => (
          <Appear key={req.id} index={i}>
          <Card className="p-4 gap-2">
            <View className="flex-row items-center justify-between">
              <Text variant="subtitle">{TYPE_LABEL[req.type]}</Text>
              <Badge tone={STATUS[req.status].tone}>{STATUS[req.status].label}</Badge>
            </View>
            {req.requestedCheckIn ? <Text variant="bodySmall" tone="muted">Giờ vào: {dayjs(req.requestedCheckIn).format('DD/MM HH:mm')}</Text> : null}
            {req.requestedCheckOut ? <Text variant="bodySmall" tone="muted">Giờ ra: {dayjs(req.requestedCheckOut).format('DD/MM HH:mm')}</Text> : null}
            <Text variant="bodySmall">{req.reason}</Text>
            {req.reviewNote ? <Text variant="caption" tone="muted">Phản hồi: {req.reviewNote}</Text> : null}
            <Text variant="caption" tone="faint">{dayjs(req.createdAt).format('DD/MM/YYYY HH:mm')}</Text>
          </Card>
          </Appear>
        ))
      )}
    </Screen>
  );
}

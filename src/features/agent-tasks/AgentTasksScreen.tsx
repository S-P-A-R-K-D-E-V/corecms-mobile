import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { AppHeader, EmptyState, ErrorView, Screen } from 'src/components/shared';
import { SegmentedControl, Skeleton, Text } from 'src/components/ui';

import { AgentTaskCard } from './AgentTaskCard';
import { TASK_SEGMENTS, agentTaskRoute, isLiveStatus, taskSegment, type TaskSegment } from './agent-task-format';
import { useAgentTasks, useScreenActive, useTicker } from './hooks';

// ----------------------------------------------------------------------
// Việc của agent (K4 — bảng việc của đội agent): việc đang làm / xong / lỗi – dừng. Tự làm mới 5 giây khi có việc đang chạy,
// 30 giây khi không; màn khuất hoặc app ở nền thì dừng. Bấm việc → chi tiết. Quyền agent.approve (guard ở src/app/agent).
// ----------------------------------------------------------------------

const EMPTY: Record<TaskSegment, { icon: 'robot-happy-outline' | 'check-circle-outline' | 'robot-confused-outline'; title: string; description?: string }> = {
  active: {
    icon: 'robot-happy-outline',
    title: 'Không có việc nào đang làm',
    description: 'Việc giao cho agent (giao tay trên web, theo lịch hoặc theo sự kiện) sẽ hiện ở đây khi đang chạy.',
  },
  done: { icon: 'check-circle-outline', title: 'Chưa có việc nào xong gần đây' },
  ended: { icon: 'robot-confused-outline', title: 'Không có việc lỗi / đã dừng gần đây' },
};

export function AgentTasksScreen() {
  const [segment, setSegment] = useState<TaskSegment>('active');
  const active = useScreenActive();
  const query = useAgentTasks(segment, active);
  // Máy chủ đã lọc theo trạng thái; lọc lại phòng khi dữ liệu cũ của tab trước còn trong bộ đệm.
  const list = useMemo(() => (query.data ?? []).filter((t) => taskSegment(t.status) === segment), [query.data, segment]);
  const anyLive = list.some((t) => isLiveStatus(t.status));
  // Có việc đang chạy: thời gian chạy nhảy từng giây; không thì 30 giây (việc chờ người vẫn đang tính giờ).
  const now = useTicker(active, anyLive ? 1_000 : 30_000);

  return (
    <Screen scroll tabBarInset={false} refreshing={query.isRefetching} onRefresh={query.refetch}>
      <AppHeader title="Việc của agent" subtitle="Đội agent đang làm gì, tới đâu" back />

      <SegmentedControl segments={TASK_SEGMENTS} value={segment} onChange={(k) => setSegment(k as TaskSegment)} />

      {query.isLoading ? (
        <View className="gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={140} radius={16} />
          ))}
        </View>
      ) : query.isError ? (
        <ErrorView message="Không tải được danh sách việc." onRetry={query.refetch} />
      ) : list.length === 0 ? (
        <EmptyState icon={EMPTY[segment].icon} title={EMPTY[segment].title} description={EMPTY[segment].description} />
      ) : (
        <>
          {list.map((task) => (
            <AgentTaskCard key={task.id} task={task} now={now} onPress={() => router.push(agentTaskRoute(task.id) as any)} />
          ))}
          {segment !== 'active' ? (
            <Text variant="caption" tone="faint" className="text-center">
              Hiện tối đa 100 việc gần nhất.
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

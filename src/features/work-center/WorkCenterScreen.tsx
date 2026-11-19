import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { getAgentTasks } from 'src/api/agent-center';
import { getWorkHubItems } from 'src/api/work-hub';
import { useAuthContext } from 'src/auth/auth-context';
import { AppHeader, EmptyState, ErrorView, Screen } from 'src/components/shared';
import { Chip, SegmentedControl, Skeleton, Text } from 'src/components/ui';
import { useScreenActive, useTicker } from 'src/features/agent-tasks/hooks';

import { WorkCenterCard } from './WorkCenterCard';
import {
  KIND_FILTERS,
  WORK_SEGMENTS,
  buildWorkCenter,
  filterKind,
  fromAgentTask,
  fromHubItem,
  workEntryRoute,
  workSources,
  type KindFilter,
  type WorkSegment,
} from './work-center';

// ----------------------------------------------------------------------
// Trung tâm việc (T3): một màn cho quản lý / chủ thấy việc agent + việc giao nhân viên + vệ sinh theo ca, tab Cần xử lý /
// Đang làm / Xong hôm nay, lọc theo loại. Mỗi nguồn chỉ tải khi có quyền của nó; bấm mục mở màn sẵn có (chi tiết việc agent,
// Chấm việc giao, Chấm vệ sinh). Tự làm mới 30 giây khi màn đang hiện.
// ----------------------------------------------------------------------

const REFRESH_MS = 30_000;

const EMPTY: Record<WorkSegment, string> = {
  todo: 'Không có việc nào chờ duyệt hay lỗi',
  doing: 'Không có việc nào đang làm',
  done: 'Hôm nay chưa có việc nào xong',
};

export function WorkCenterScreen() {
  const { user } = useAuthContext();
  const src = workSources(user);
  const active = useScreenActive();
  const [segment, setSegment] = useState<WorkSegment>('todo');
  const [kind, setKind] = useState<KindFilter>('all');

  const agentQuery = useQuery({
    queryKey: ['work-center', 'agent'],
    queryFn: () => getAgentTasks([], 200, { hideConversation: true }),
    enabled: src.agent,
    refetchInterval: active ? REFRESH_MS : false,
  });
  const hubKinds = [...(src.work ? (['work'] as const) : []), ...(src.cleaning ? (['cleaning'] as const) : [])];
  const hubQuery = useQuery({
    queryKey: ['work-center', 'hub', hubKinds.join(',')],
    queryFn: () => getWorkHubItems(7, hubKinds),
    enabled: hubKinds.length > 0,
    refetchInterval: active ? REFRESH_MS : false,
  });
  const now = useTicker(active, REFRESH_MS);

  const board = useMemo(
    () =>
      buildWorkCenter(
        [...(src.agent ? (agentQuery.data ?? []).map(fromAgentTask) : []), ...(hubQuery.data ?? []).map(fromHubItem)],
        now
      ),
    [agentQuery.data, hubQuery.data, src.agent, now]
  );
  const list = filterKind(board.lists[segment], kind);
  const kinds = KIND_FILTERS.filter((k) => k.key === 'all' || src[k.key]);
  const segments = WORK_SEGMENTS.map((s) => ({ key: s.key, label: `${s.label} (${board.counts[s.key]})` }));

  const loading = (src.agent && agentQuery.isLoading) || (hubKinds.length > 0 && hubQuery.isLoading);
  const failed = agentQuery.isError || hubQuery.isError;
  const refetch = () => {
    if (src.agent) agentQuery.refetch();
    if (hubKinds.length > 0) hubQuery.refetch();
  };

  return (
    <Screen
      scroll
      tabBarInset={false}
      refreshing={agentQuery.isRefetching || hubQuery.isRefetching}
      onRefresh={refetch}
    >
      <AppHeader title="Trung tâm việc" subtitle="Agent, việc giao và vệ sinh ở một chỗ" back />

      <SegmentedControl segments={segments} value={segment} onChange={(k) => setSegment(k as WorkSegment)} />

      {kinds.length > 2 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {kinds.map((k) => (
            <Chip
              key={k.key}
              label={k.label}
              icon={k.icon}
              size="sm"
              color="primary"
              selected={kind === k.key}
              onPress={() => setKind(k.key)}
            />
          ))}
        </ScrollView>
      ) : null}

      {failed ? (
        <ErrorView message="Không tải đủ danh sách việc." onRetry={refetch} />
      ) : null}

      {loading ? (
        <View className="gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={112} radius={16} />
          ))}
        </View>
      ) : list.length === 0 && !failed ? (
        <EmptyState icon="check-all" title={EMPTY[segment]} />
      ) : (
        <>
          {list.map((entry) => {
            const route = workEntryRoute(entry, user);
            return (
              <WorkCenterCard
                key={entry.key}
                entry={entry}
                now={now}
                onPress={route ? () => router.push(route as any) : null}
              />
            );
          })}
          {segment === 'todo' && src.cleaning ? (
            <Text variant="caption" tone="faint" className="text-center">
              Ca vệ sinh trước hôm qua chưa chấm: xem ở màn Chấm vệ sinh.
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

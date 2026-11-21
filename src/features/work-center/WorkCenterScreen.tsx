import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getAgentTasks } from 'src/api/agent-center';
import { getWorkHubItems } from 'src/api/work-hub';
import { useAuthContext } from 'src/auth/auth-context';
import { AppHeader, EmptyState, ErrorView, Screen } from 'src/components/shared';
import { Chip, SegmentedControl, Skeleton, Text } from 'src/components/ui';
import { useScreenActive, useTicker } from 'src/features/agent-tasks/hooks';

import { AssignTab } from './AssignTab';
import { ScheduleTab } from './ScheduleTab';
import { WorkCenterCard } from './WorkCenterCard';
import {
  WORK_SEGMENTS,
  WORK_TABS,
  availableTabs,
  buildWorkCenter,
  filterSource,
  fromAgentTask,
  fromHubItem,
  hubKinds,
  resolveSource,
  resolveTab,
  sourceFilters,
  workEntryRoute,
  workSources,
  type SourceFilter,
  type WorkAccess,
  type WorkSegment,
  type WorkTab,
} from './work-center';

// ----------------------------------------------------------------------
// Công việc (quản lý / chủ) — mọi nhiệm vụ của cửa hàng ở một chỗ, 3 tab như web:
//   Bảng việc: việc agent + việc giao + việc theo ca + lỗi / sửa tận gốc từ kiểm tra; nhóm Cần xử lý / Đang làm / Xong hôm
//              nay, lọc theo nguồn. Tự làm mới 30 giây khi màn đang hiện.
//   Lịch tuần: việc định kỳ theo thứ × ca (thêm / sửa / dừng theo cleaning.template.manage).
//   Giao việc: giao cả ca (một ngày) / một người, đổi người.
// Mở với ?tab=board|schedule|assign và ?source=… (link cũ chuyển hướng về đây).
// ----------------------------------------------------------------------

const REFRESH_MS = 30_000;

const EMPTY: Record<WorkSegment, string> = {
  todo: 'Không có việc nào chờ duyệt hay lỗi',
  doing: 'Không có việc nào đang làm',
  done: 'Hôm nay chưa có việc nào xong',
};

function BoardTab({ access, initialSource }: { access: WorkAccess; initialSource: SourceFilter }) {
  const { user } = useAuthContext();
  const active = useScreenActive();
  const [segment, setSegment] = useState<WorkSegment>('todo');
  const [source, setSource] = useState<SourceFilter>(initialSource);
  useEffect(() => setSource(initialSource), [initialSource]);

  const agentQuery = useQuery({
    queryKey: ['work-center', 'agent'],
    queryFn: () => getAgentTasks([], 200, { hideConversation: true }),
    enabled: access.agent,
    refetchInterval: active ? REFRESH_MS : false,
  });
  const kinds = hubKinds(access);
  const hubQuery = useQuery({
    queryKey: ['work-center', 'hub', kinds.join(',')],
    queryFn: () => getWorkHubItems(7, kinds),
    enabled: kinds.length > 0,
    refetchInterval: active ? REFRESH_MS : false,
  });
  const now = useTicker(active, REFRESH_MS);

  const board = useMemo(
    () =>
      buildWorkCenter(
        [...(access.agent ? (agentQuery.data ?? []).map(fromAgentTask) : []), ...(hubQuery.data ?? []).map(fromHubItem)],
        now
      ),
    [agentQuery.data, hubQuery.data, access.agent, now]
  );
  const list = filterSource(board.lists[segment], source);
  const filters = sourceFilters(access);
  const segments = WORK_SEGMENTS.map((s) => ({ key: s.key, label: `${s.label} (${board.counts[s.key]})` }));

  const loading = (access.agent && agentQuery.isLoading) || (kinds.length > 0 && hubQuery.isLoading);
  const failed = agentQuery.isError || hubQuery.isError;
  const refetch = () => {
    if (access.agent) agentQuery.refetch();
    if (kinds.length > 0) hubQuery.refetch();
  };

  return (
    <View className="gap-3">
      <SegmentedControl segments={segments} value={segment} onChange={(k) => setSegment(k as WorkSegment)} />

      {filters.length > 2 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {filters.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              icon={f.icon}
              size="sm"
              color="primary"
              selected={source === f.key}
              onPress={() => setSource(f.key)}
            />
          ))}
        </ScrollView>
      ) : null}

      {failed ? <ErrorView message="Không tải đủ danh sách việc." onRetry={refetch} /> : null}

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
          {segment === 'todo' && access.cleaning ? (
            <Text variant="caption" tone="faint" className="text-center">
              Ca trước hôm qua chưa chấm không hiện ở đây — xem trên web (Công việc → Lịch sử).
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

export function WorkCenterScreen() {
  const qc = useQueryClient();
  const { user } = useAuthContext();
  const access = workSources(user);
  const params = useLocalSearchParams<{ tab?: string; source?: string }>();
  const [tab, setTab] = useState<WorkTab>(() => resolveTab(params.tab, access));
  const [refreshing, setRefreshing] = useState(false);
  const tabs = availableTabs(access);

  // Mở lại màn với ?tab= khác (thông báo, link cũ) khi màn đã có trong stack.
  useEffect(() => {
    if (params.tab) setTab(resolveTab(params.tab, access));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab]);

  const subtitle: Record<WorkTab, string> = {
    board: 'Mọi việc của cửa hàng ở một chỗ',
    schedule: 'Việc lặp hằng tuần, tự sinh mỗi ngày',
    assign: 'Giao thêm cho cả ca hoặc một người',
  };

  return (
    <Screen
      scroll
      tabBarInset={false}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await qc.invalidateQueries({ queryKey: ['work-center'] }).catch(() => {});
        setRefreshing(false);
      }}
    >
      <AppHeader title="Công việc" subtitle={subtitle[tab]} back />

      {tabs.length > 1 ? (
        <SegmentedControl
          segments={WORK_TABS.filter((t) => tabs.includes(t.key))}
          value={tab}
          onChange={(k) => setTab(k as WorkTab)}
        />
      ) : null}

      {tab === 'schedule' ? (
        <ScheduleTab canEdit={access.editSchedule} />
      ) : tab === 'assign' ? (
        <AssignTab canAssignShift={access.editSchedule} canAssignPerson={access.work} />
      ) : (
        <BoardTab access={access} initialSource={resolveSource(params.source)} />
      )}
    </Screen>
  );
}

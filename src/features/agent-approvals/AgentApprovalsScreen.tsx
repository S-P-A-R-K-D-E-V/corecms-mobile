import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { AppHeader, EmptyState, ErrorView, Screen } from 'src/components/shared';
import { SegmentedControl, Skeleton, Text } from 'src/components/ui';

import { AgentActionCard } from './AgentActionCard';
import { agentActionRoute } from './agent-action-format';
import { useAgentActions, useNow } from './hooks';

// ----------------------------------------------------------------------
// Duyệt việc agent (K3 — cổng duyệt lệnh ghi): phiếu agent xin làm thay người, đang chờ duyệt; tab "Đã xử lý" là phiếu gần
// đây đã duyệt / từ chối / hết hạn. Bấm phiếu → chi tiết để Duyệt (máy chủ chạy ngay) hoặc Từ chối. Quyền agent.approve.
// ----------------------------------------------------------------------

type Tab = 'pending' | 'done';

const TABS = [
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'done', label: 'Đã xử lý' },
];

export function AgentApprovalsScreen() {
  const [tab, setTab] = useState<Tab>('pending');
  const now = useNow();
  const query = useAgentActions(tab === 'pending' ? 'pending' : 'all');
  const list = useMemo(() => {
    const items = query.data ?? [];
    return tab === 'pending' ? items.filter((a) => a.status === 'pending') : items.filter((a) => a.status !== 'pending');
  }, [query.data, tab]);

  return (
    <Screen scroll tabBarInset={false} refreshing={query.isRefetching} onRefresh={query.refetch}>
      <AppHeader title="Duyệt việc agent" subtitle="Agent xin làm thay — bạn duyệt mới chạy" back />

      <Text variant="caption" tone="muted">
        Duyệt là hệ thống chạy ngay đúng lệnh agent đã gửi, bạn là người thực hiện. Đọc kỹ tham số trước khi duyệt; phiếu quá hạn
        tự huỷ.
      </Text>

      <SegmentedControl segments={TABS} value={tab} onChange={(k) => setTab(k as Tab)} />

      {query.isLoading ? (
        <View className="gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={150} radius={16} />
          ))}
        </View>
      ) : query.isError ? (
        <ErrorView message="Không tải được danh sách phiếu." onRetry={query.refetch} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={tab === 'pending' ? 'robot-happy-outline' : 'history'}
          title={tab === 'pending' ? 'Không có việc nào chờ duyệt' : 'Chưa có phiếu nào đã xử lý'}
          description={
            tab === 'pending' ? 'Khi agent xin làm một việc cần duyệt, bạn sẽ nhận thông báo và thấy ở đây.' : undefined
          }
        />
      ) : (
        list.map((action) => (
          <AgentActionCard
            key={action.id}
            action={action}
            now={now}
            onPress={() => router.push(agentActionRoute(action.id) as any)}
          />
        ))
      )}
    </Screen>
  );
}

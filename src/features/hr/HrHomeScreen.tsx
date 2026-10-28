import { View } from 'react-native';
import { router } from 'expo-router';

import { Screen, AppHeader, SectionCard, ListItem } from 'src/components/shared';
import { Text, CountBadge } from 'src/components/ui';
import { useHrPendingCounts } from './hooks';

// ----------------------------------------------------------------------
// Nhân sự (phần của nhân viên): xin nghỉ ca, văn bản cần đọc và xác nhận, nhiệm vụ + phiếu sáng kiến, biên bản cần ký,
// điểm & xếp loại đã công bố, hợp đồng của tôi (chỉ xem). Quản lý duyệt / giao / lập biên bản / tính điểm / soạn hợp
// đồng trên web.
// ----------------------------------------------------------------------

function Count({ n, tone = 'primary' }: { n: number; tone?: 'primary' | 'error' }) {
  return n > 0 ? <CountBadge count={n} tone={tone} /> : null;
}

export function HrHomeScreen() {
  const counts = useHrPendingCounts();

  return (
    <Screen scroll refreshing={counts.isFetching} onRefresh={counts.refetch}>
      <AppHeader title="Nhân sự" back />
      <SectionCard title="Việc của tôi" bodyClassName="pt-0">
        <ListItem
          icon="file-sign"
          iconTone="warning"
          title="Nội quy & văn bản cần xác nhận"
          subtitle={counts.policies > 0 ? `${counts.policies} văn bản chưa xác nhận` : 'Đã xác nhận hết'}
          right={<Count n={counts.policies} tone="error" />}
          onPress={() => router.push('/hr/policies' as any)}
          showChevron
        />
        <ListItem
          icon="calendar-remove-outline"
          iconTone="primary"
          title="Xin nghỉ ca"
          subtitle={counts.leaves > 0 ? `${counts.leaves} đơn chờ duyệt` : 'Báo trước ít nhất 24 giờ'}
          right={<Count n={counts.leaves} />}
          onPress={() => router.push('/hr/leave' as any)}
          showChevron
        />
        <ListItem
          icon="checkbox-marked-circle-outline"
          iconTone="success"
          title="Nhiệm vụ & sáng kiến"
          subtitle={counts.tasks > 0 ? `${counts.tasks} nhiệm vụ cần nộp` : 'Không có nhiệm vụ đang làm'}
          right={<Count n={counts.tasks} />}
          onPress={() => router.push('/hr/tasks' as any)}
          showChevron
        />
        <ListItem
          icon="file-document-edit-outline"
          iconTone="error"
          title="Biên bản"
          subtitle={counts.records > 0 ? `${counts.records} biên bản chờ ký` : 'Không có biên bản chờ ký'}
          right={<Count n={counts.records} tone="error" />}
          onPress={() => router.push('/hr/records' as any)}
          showChevron
        />
        <ListItem
          icon="clipboard-check-outline"
          iconTone="warning"
          title="Kiểm hàng ca"
          subtitle={counts.stockChecks > 0 ? `${counts.stockChecks} phiếu cần đếm hôm nay` : 'Đếm khu hàng của ca mình'}
          right={<Count n={counts.stockChecks} tone="error" />}
          onPress={() => router.push('/hr/stock-check' as any)}
          showChevron
        />
        <ListItem
          icon="chart-line"
          iconTone="info"
          title="Điểm, lương & thưởng"
          subtitle="Lương tạm tính, thưởng tuần, điểm các tháng"
          onPress={() => router.push('/hr/performance' as any)}
          showChevron
        />
        <ListItem
          icon="file-document-outline"
          iconTone="primary"
          title="Hợp đồng của tôi"
          subtitle="Xem hợp đồng và bản đã ký"
          onPress={() => router.push('/hr/contracts' as any)}
          showChevron
        />
      </SectionCard>
      <View className="px-1">
        <Text variant="caption" tone="muted">
          Cửa hàng không phạt tiền, không trừ lương thay cho kỷ luật. Biên bản chỉ ghi nhận sự việc; bạn được ghi ý kiến trước khi
          ký.
        </Text>
      </View>
    </Screen>
  );
}

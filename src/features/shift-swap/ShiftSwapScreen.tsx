import { useCallback, useState } from 'react';
import { View, FlatList, RefreshControl, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import dayjs from 'dayjs';

import { AppHeader, EmptyState, Loading, Sheet } from 'src/components/shared';
import { Card, Text, Badge, Button, Icon, Pressable, Divider, TextField } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
import { getMyShiftSwapRequests, getMyConfirmationRequests, confirmShiftSwapTarget } from 'src/api/shiftSwap';
import { extractApiError } from 'src/services/error';
import type { IShiftSwapRequest } from 'src/types/corecms-api';

const STATUS_META: Record<string, { label: string; tone: 'warning' | 'success' | 'error' | 'neutral' }> = {
  PendingTargetConfirm: { label: 'Chờ đồng nghiệp xác nhận', tone: 'warning' },
  Pending: { label: 'Chờ quản lý duyệt', tone: 'warning' },
  Approved: { label: 'Đã duyệt', tone: 'success' },
  Rejected: { label: 'Bị từ chối', tone: 'error' },
  TargetDeclined: { label: 'Đồng nghiệp từ chối', tone: 'error' },
  Cancelled: { label: 'Đã huỷ', tone: 'neutral' },
};

const fmtDate = (d?: string) => (d ? dayjs(d).format('DD/MM/YYYY') : '—');

function SwapCard({ item, mode, onConfirm }: { item: IShiftSwapRequest; mode: 'mine' | 'confirm'; onConfirm?: (i: IShiftSwapRequest, accepted: boolean) => void }) {
  const meta = STATUS_META[item.status] ?? { label: item.status, tone: 'neutral' as const };
  const canRespond = mode === 'confirm' && !item.targetConfirmedAt && (item.status === 'PendingTargetConfirm' || item.status === 'Pending');
  return (
    <Card className="p-4">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text variant="subtitle">{mode === 'mine' ? `Đổi với: ${item.targetUserName ?? '—'}` : `Từ: ${item.requesterName}`}</Text>
          <Text variant="caption" tone="faint">Gửi lúc {dayjs(item.createdAt).format('HH:mm DD/MM/YYYY')}</Text>
        </View>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </View>
      <Divider className="my-2.5" />
      <View className="flex-row items-center gap-2.5">
        <View className="flex-1">
          <Text variant="caption" tone="faint">{mode === 'mine' ? 'Ca của tôi' : 'Ca của họ'}</Text>
          <Text className="font-semibold">{item.currentShiftName}</Text>
          <Text variant="caption" tone="muted">{fmtDate(item.currentShiftDate)}</Text>
        </View>
        <Icon name="swap-horizontal" size={22} tone="primary" />
        <View className="flex-1 items-end">
          <Text variant="caption" tone="faint">{mode === 'mine' ? 'Ca muốn nhận' : 'Ca của tôi'}</Text>
          <Text className="font-semibold">{item.targetShiftName ?? 'Không đổi lại ca'}</Text>
          <Text variant="caption" tone="muted">{fmtDate(item.targetShiftDate)}</Text>
        </View>
      </View>
      {item.reason ? <Text variant="bodySmall" tone="muted" className="mt-2">Lý do: {item.reason}</Text> : null}
      {item.reviewNote ? <Text variant="bodySmall" tone="muted" className="mt-1">Phản hồi quản lý: {item.reviewNote}</Text> : null}
      {item.targetDeclineReason ? <Text variant="bodySmall" tone="error" className="mt-1">Lý do từ chối: {item.targetDeclineReason}</Text> : null}
      {canRespond && onConfirm ? (
        <View className="flex-row gap-2.5 mt-3.5">
          <View className="flex-1"><Button variant="outline" action="error" onPress={() => onConfirm(item, false)}>Từ chối</Button></View>
          <View className="flex-1"><Button onPress={() => onConfirm(item, true)}>Đồng ý đổi</Button></View>
        </View>
      ) : null}
    </Card>
  );
}

export function ShiftSwapScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'mine' | 'confirm'>('mine');
  const [mine, setMine] = useState<IShiftSwapRequest[]>([]);
  const [confirms, setConfirms] = useState<IShiftSwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<IShiftSwapRequest | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [responding, setResponding] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([getMyShiftSwapRequests(), getMyConfirmationRequests()]);
      setMine(m);
      setConfirms(c);
    } catch {
      Alert.alert('Lỗi', 'Không thể tải danh sách đổi ca.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  async function respond(item: IShiftSwapRequest, accepted: boolean, reason?: string) {
    setResponding(true);
    try {
      await confirmShiftSwapTarget(item.id, { isAccepted: accepted, declineReason: reason });
      await fetchData();
    } catch (err: any) {
      Alert.alert('Lỗi', extractApiError(err));
    } finally {
      setResponding(false);
    }
  }

  function handleConfirm(item: IShiftSwapRequest, accepted: boolean) {
    if (accepted) {
      Alert.alert('Đồng ý đổi ca', 'Xác nhận đồng ý đổi ca? Yêu cầu sẽ chuyển cho quản lý duyệt.', [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Đồng ý', onPress: () => respond(item, true) },
      ]);
    } else {
      setDeclineReason('');
      setDeclineTarget(item);
    }
  }

  const data = tab === 'mine' ? mine : confirms;
  const pendingConfirm = confirms.filter((r) => !r.targetConfirmedAt && (r.status === 'PendingTargetConfirm' || r.status === 'Pending')).length;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="px-4 pt-2">
        <AppHeader title="Đổi ca" back />
        <View className="flex-row bg-surface dark:bg-surface-dark rounded-xl p-1 mb-2 border border-line/60 dark:border-line-dark">
          {([['mine', `Của tôi (${mine.length})`], ['confirm', `Chờ xác nhận (${pendingConfirm})`]] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} className={cn('flex-1 py-2 rounded-lg items-center', tab === key && 'bg-primary')}>
              <Text variant="bodySmall" className={cn('font-semibold', tab === key ? 'text-white' : 'text-muted')}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => i.id}
          contentContainerClassName="px-4 pb-24 gap-3"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} colors={[brand.primary]} tintColor={brand.primary} />}
          renderItem={({ item }) => <SwapCard item={item} mode={tab} onConfirm={handleConfirm} />}
          ListEmptyComponent={<EmptyState icon="swap-horizontal-circle-outline" title={tab === 'mine' ? 'Bạn chưa có yêu cầu đổi ca' : 'Không có yêu cầu chờ bạn xác nhận'} description={tab === 'mine' ? 'Tạo đổi ca từ màn Lịch làm (nhấn vào ca).' : undefined} />}
        />
      )}

      {tab === 'mine' ? (
        <View className="absolute right-4 bottom-6">
          <Button fullWidth={false} icon="plus" onPress={() => router.push('/(tabs)/schedule')} className="px-5 rounded-2xl shadow-lg">Tạo đổi ca</Button>
        </View>
      ) : null}

      <Sheet
        visible={!!declineTarget}
        title="Từ chối đổi ca"
        onClose={() => setDeclineTarget(null)}
        footer={
          <Button action="error" loading={responding} onPress={async () => {
            if (!declineTarget) return;
            const target = declineTarget;
            setDeclineTarget(null);
            await respond(target, false, declineReason.trim() || undefined);
          }}>Từ chối</Button>
        }
      >
        <TextField label="Lý do từ chối (không bắt buộc)" value={declineReason} onChangeText={setDeclineReason} multiline className="min-h-[80px]" />
      </Sheet>
    </View>
  );
}

import { useCallback, useState } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import dayjs from 'dayjs';

import { AppHeader, EmptyState, Loading } from 'src/components/shared';
import { Card, Text, Badge, Button, Divider, SegmentedControl, Appear } from 'src/components/ui';
import { brand, softShadow } from 'src/theme';
import { toast, confirm, showActionSheet } from 'src/components/overlay';
import { getOpenPoolPosts, getMyPoolPosts, getMyClaims, claimShiftPoolPost, cancelShiftPoolPost, reviewShiftPoolPost } from 'src/api/shiftPool';
import { useAuthContext } from 'src/auth/auth-context';
import { extractApiError } from 'src/services/error';
import type { IShiftPoolPost } from 'src/types/corecms-api';
import { NEED_TYPE_LABEL, POOL_STATUS_LABEL, POOL_STATUS_TONE, fmtMoney } from 'src/features/schedule/constants';

type Tab = 'open' | 'mine' | 'claims';

export function ShiftPoolScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();
  const [tab, setTab] = useState<Tab>('open');
  const [open, setOpen] = useState<IShiftPoolPost[]>([]);
  const [mine, setMine] = useState<IShiftPoolPost[]>([]);
  const [claims, setClaims] = useState<IShiftPoolPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [o, m, c] = await Promise.all([getOpenPoolPosts(), getMyPoolPosts(), getMyClaims()]);
      setOpen(o.filter((p) => p.posterId !== user?.id));
      setMine(m);
      setClaims(c);
    } catch {
      toast.error('Không thể tải dữ liệu chợ ca.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await fetchData(); }
    catch (err: any) { toast.error(extractApiError(err)); }
    finally { setBusy(false); }
  }

  async function onClaim(post: IShiftPoolPost) {
    if (post.needType === 'Swap') {
      const ok = await confirm({
        title: 'Đổi ca',
        message: 'Để nhận đổi ca (cần chọn ca đổi lại), vui lòng vào màn Lịch làm.',
        confirmText: 'Mở Lịch làm',
      });
      if (ok) router.push('/(tabs)/schedule');
      return;
    }
    const ok = await confirm({
      title: 'Nhận làm hộ',
      message: `Nhận ${NEED_TYPE_LABEL[post.needType]} ca ${post.shiftName}?`,
      confirmText: 'Nhận',
    });
    if (ok) run(() => claimShiftPoolPost(post.id, {}));
  }

  async function onManage(post: IShiftPoolPost) {
    if (post.status === 'Open') {
      const ok = await confirm({
        title: 'Huỷ bài đăng',
        message: 'Huỷ bài đăng này khỏi chợ ca?',
        confirmText: 'Huỷ bài',
        destructive: true,
      });
      if (ok) run(() => cancelShiftPoolPost(post.id));
    } else if (post.status === 'WaitingApproval') {
      showActionSheet({
        title: 'Duyệt người nhận',
        message: `${post.claimerName ?? 'Có người'} muốn nhận ca này.`,
        options: [
          { label: 'Xác nhận', icon: 'check-circle', onPress: () => run(() => reviewShiftPoolPost(post.id, { action: 'Approve' })) },
          { label: 'Từ chối', icon: 'close-circle', destructive: true, onPress: () => run(() => reviewShiftPoolPost(post.id, { action: 'RejectClaim' })) },
        ],
      });
    }
  }

  const data = tab === 'open' ? open : tab === 'mine' ? mine : claims;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="px-4 pt-2">
        <AppHeader title="Làm hộ ca" back />
        <SegmentedControl
          className="mb-2"
          value={tab}
          onChange={(k) => setTab(k as Tab)}
          segments={[
            { key: 'open', label: `Chợ ca (${open.length})` },
            { key: 'mine', label: `Tôi đăng (${mine.length})` },
            { key: 'claims', label: `Tôi nhận (${claims.length})` },
          ]}
        />
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => i.id}
          contentContainerClassName="px-4 pb-24 gap-3"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} colors={[brand.primary]} tintColor={brand.primary} />}
          renderItem={({ item, index }) => {
            // Ca đã bắt đầu/kết thúc → hết hạn nhận (BE cũng chặn, nhưng disable
            // trước để không bấm nhầm). Mốc = giờ BẮT ĐẦU ca theo ngày ca.
            const expired = dayjs(`${String(item.shiftDate).slice(0, 10)} ${item.shiftStartTime}`).isBefore(dayjs());
            return (
            <Appear index={Math.min(index, 8)}>
            <Card className="p-4 gap-1.5">
              <View className="flex-row items-center justify-between">
                <Text variant="subtitle">{NEED_TYPE_LABEL[item.needType]} · {item.shiftName}</Text>
                <Badge tone={expired && item.status === 'Open' ? 'error' : POOL_STATUS_TONE[item.status]}>
                  {expired && item.status === 'Open' ? 'Quá hạn' : POOL_STATUS_LABEL[item.status]}
                </Badge>
              </View>
              <Text variant="bodySmall" tone="muted">{dayjs(item.shiftDate).format('DD/MM/YYYY')} · {item.shiftStartTime} – {item.shiftEndTime}</Text>
              <Text variant="bodySmall" tone="muted">{tab === 'open' || tab === 'claims' ? `Người đăng: ${item.posterName}` : item.claimerName ? `Người nhận: ${item.claimerName}` : 'Chưa có người nhận'}</Text>
              {item.extraPayAmount ? <Text variant="bodySmall" tone="primary" className="font-semibold">Phụ cấp: {fmtMoney(item.extraPayAmount)}</Text> : null}

              {tab === 'open' ? (
                <><Divider className="my-1" /><Button size="sm" icon={expired ? 'clock-alert-outline' : 'hand-back-right-outline'} disabled={expired} loading={busy} onPress={() => onClaim(item)}>{expired ? 'Ca đã qua — không thể nhận' : 'Nhận ca'}</Button></>
              ) : null}
              {tab === 'mine' && (item.status === 'Open' || item.status === 'WaitingApproval') ? (
                <><Divider className="my-1" /><Button size="sm" variant="outline" loading={busy} onPress={() => onManage(item)}>{item.status === 'Open' ? 'Quản lý / Huỷ' : 'Duyệt người nhận'}</Button></>
              ) : null}
            </Card>
            </Appear>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="account-group-outline"
              title={tab === 'open' ? 'Chưa có ca nào trên chợ' : tab === 'mine' ? 'Bạn chưa đăng ca nào' : 'Bạn chưa nhận ca nào'}
              description={tab === 'mine' ? 'Đăng ca cần làm hộ từ màn Lịch làm (nhấn vào ca).' : undefined}
            />
          }
        />
      )}

      {tab === 'mine' ? (
        <View className="absolute right-4 bottom-6" style={softShadow}>
          <Button fullWidth={false} icon="plus" onPress={() => router.push('/(tabs)/schedule')} className="px-5 rounded-2xl">Đăng ca</Button>
        </View>
      ) : null}
    </View>
  );
}

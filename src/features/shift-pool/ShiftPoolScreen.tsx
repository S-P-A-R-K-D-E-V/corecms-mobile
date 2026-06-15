import { useCallback, useState } from 'react';
import { View, FlatList, RefreshControl, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import dayjs from 'dayjs';

import { AppHeader, EmptyState, Loading } from 'src/components/shared';
import { Card, Text, Badge, Button, Pressable, Divider } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
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
      Alert.alert('Lỗi', 'Không thể tải dữ liệu chợ ca.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await fetchData(); }
    catch (err: any) { Alert.alert('Lỗi', extractApiError(err)); }
    finally { setBusy(false); }
  }

  function onClaim(post: IShiftPoolPost) {
    if (post.needType === 'Swap') {
      Alert.alert('Đổi ca', 'Để nhận đổi ca (cần chọn ca đổi lại), vui lòng vào màn Lịch làm.', [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Mở Lịch làm', onPress: () => router.push('/(tabs)/schedule') },
      ]);
      return;
    }
    Alert.alert('Nhận làm hộ', `Nhận ${NEED_TYPE_LABEL[post.needType]} ca ${post.shiftName}?`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Nhận', onPress: () => run(() => claimShiftPoolPost(post.id, {})) },
    ]);
  }

  function onManage(post: IShiftPoolPost) {
    if (post.status === 'Open') {
      Alert.alert('Bài đăng', 'Huỷ bài đăng này?', [
        { text: 'Đóng', style: 'cancel' },
        { text: 'Huỷ bài', style: 'destructive', onPress: () => run(() => cancelShiftPoolPost(post.id)) },
      ]);
    } else if (post.status === 'WaitingApproval') {
      Alert.alert('Duyệt người nhận', `${post.claimerName ?? 'Có người'} muốn nhận. Xác nhận?`, [
        { text: 'Từ chối', style: 'destructive', onPress: () => run(() => reviewShiftPoolPost(post.id, { action: 'RejectClaim' })) },
        { text: 'Xác nhận', onPress: () => run(() => reviewShiftPoolPost(post.id, { action: 'Approve' })) },
      ]);
    }
  }

  const data = tab === 'open' ? open : tab === 'mine' ? mine : claims;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="px-4 pt-2">
        <AppHeader title="Làm hộ ca" back />
        <View className="flex-row bg-surface dark:bg-surface-dark rounded-xl p-1 mb-2 border border-line/60 dark:border-line-dark">
          {([['open', `Chợ ca (${open.length})`], ['mine', `Tôi đăng (${mine.length})`], ['claims', `Tôi nhận (${claims.length})`]] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} className={cn('flex-1 py-2 rounded-lg items-center', tab === key && 'bg-primary')}>
              <Text variant="caption" className={cn('font-semibold', tab === key ? 'text-white' : 'text-muted')}>{label}</Text>
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
          renderItem={({ item }) => (
            <Card className="p-4 gap-1.5">
              <View className="flex-row items-center justify-between">
                <Text variant="subtitle">{NEED_TYPE_LABEL[item.needType]} · {item.shiftName}</Text>
                <Badge tone={POOL_STATUS_TONE[item.status]}>{POOL_STATUS_LABEL[item.status]}</Badge>
              </View>
              <Text variant="bodySmall" tone="muted">{dayjs(item.shiftDate).format('DD/MM/YYYY')} · {item.shiftStartTime} – {item.shiftEndTime}</Text>
              <Text variant="bodySmall" tone="muted">{tab === 'open' || tab === 'claims' ? `Người đăng: ${item.posterName}` : item.claimerName ? `Người nhận: ${item.claimerName}` : 'Chưa có người nhận'}</Text>
              {item.extraPayAmount ? <Text variant="bodySmall" tone="primary" className="font-semibold">Phụ cấp: {fmtMoney(item.extraPayAmount)}</Text> : null}

              {tab === 'open' ? (
                <><Divider className="my-1" /><Button size="sm" icon="hand-back-right-outline" loading={busy} onPress={() => onClaim(item)}>Nhận ca</Button></>
              ) : null}
              {tab === 'mine' && (item.status === 'Open' || item.status === 'WaitingApproval') ? (
                <><Divider className="my-1" /><Button size="sm" variant="outline" loading={busy} onPress={() => onManage(item)}>{item.status === 'Open' ? 'Quản lý / Huỷ' : 'Duyệt người nhận'}</Button></>
              ) : null}
            </Card>
          )}
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
        <View className="absolute right-4 bottom-6">
          <Button fullWidth={false} icon="plus" onPress={() => router.push('/(tabs)/schedule')} className="px-5 rounded-2xl shadow-lg">Đăng ca</Button>
        </View>
      ) : null}
    </View>
  );
}

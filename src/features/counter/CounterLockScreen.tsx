import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { Avatar, Button, Icon, Pressable, Spinner, Text, cn } from 'src/components/ui';
import { confirm, toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { getStorageUrl } from 'src/api/axios';
import {
  getCounterRoster,
  requestCounterLogin,
  verifyCounterLogin,
  type CounterError,
  type CounterPerson,
} from 'src/api/counter';
import { leaveCounterMode, useCounterMode } from 'src/services/counter-mode';
import { getStore } from 'src/services/store-config';

// ----------------------------------------------------------------------
// Màn khoá máy quầy: người có ca hôm nay ở chi nhánh (+ chủ cửa hàng / quản lý). Bấm tên → mã 6 số gửi về app
// điện thoại của người đó → nhập mã trên bàn phím số → vào app. Thiết kế cho POS / tablet ngang (lưới nhiều cột,
// bàn phím lớn) nhưng vẫn dùng được trên màn dọc.

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

const STATUS_LABEL: Record<string, string> = {
  working: 'Đang trong ca',
  upcoming: 'Sắp vào ca',
  ended: 'Đã hết ca',
  manager: 'Quản lý',
};

function roleLabel(p: CounterPerson): string {
  if (p.role === 'Admin') return 'Chủ cửa hàng';
  if (p.role === 'Manager') return 'Quản lý';
  return p.startTime && p.endTime ? `${p.shiftName ? `${p.shiftName} · ` : ''}${p.startTime}–${p.endTime}` : 'Nhân viên';
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

type Pending = { person: CounterPerson; requestId: string; expiresAt: number; sentTo: number; resendAt: number };

export function CounterLockScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const device = useCounterMode((s) => s.device);
  const { loginWithAuthResponse } = useAuthContext();
  const store = getStore();
  const now = useClock();

  const rosterQ = useQuery({
    queryKey: ['counter-roster', device?.deviceId],
    queryFn: getCounterRoster,
    enabled: !!device,
    refetchInterval: 60_000,
    retry: (count, err) => (err as unknown as CounterError)?.code !== 'Counter.Unauthorized' && count < 2,
  });
  const rosterError = rosterQ.error as unknown as CounterError | null;
  const revoked = rosterError?.code === 'Counter.Unauthorized' || rosterError?.code === 'Counter.NotCounterDevice';

  const [sending, setSending] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const people = rosterQ.data?.people ?? [];
  const groups = useMemo(() => {
    const order: [string, CounterPerson[]][] = [
      ['working', people.filter((p) => p.status === 'working')],
      ['upcoming', people.filter((p) => p.status === 'upcoming')],
      ['manager', people.filter((p) => p.status === 'manager')],
      ['ended', people.filter((p) => p.status === 'ended')],
    ];
    return order.filter(([, list]) => list.length > 0);
  }, [people]);

  const columns = width >= 1100 ? 5 : width >= 840 ? 4 : width >= 600 ? 3 : 2;
  const gap = 12;
  const cardWidth = Math.floor((Math.min(width, 1280) - 32 - gap * (columns - 1)) / columns);

  async function choose(person: CounterPerson) {
    if (!person.canSignIn) {
      toast.info(person.status === 'ended' ? 'Ca của bạn đã kết thúc.' : 'Chưa tới giờ đăng nhập (sớm nhất 2 giờ trước ca).');
      return;
    }
    if (!person.hasApp) {
      toast.warning('Đăng nhập app trên điện thoại của bạn (và bật thông báo) để nhận mã.', 'Chưa nhận được mã');
      return;
    }
    setSending(person.userId);
    try {
      const res = await requestCounterLogin(person.userId);
      const t = Date.now();
      setPending({
        person,
        requestId: res.requestId,
        expiresAt: t + res.expiresInSeconds * 1000,
        sentTo: res.sentToDevices,
        resendAt: t + RESEND_SECONDS * 1000,
      });
    } catch (err) {
      toast.error((err as CounterError).message ?? 'Không gửi được mã.');
    } finally {
      setSending(null);
    }
  }

  async function leave() {
    const ok = await confirm({
      title: 'Máy quầy đã bị thu hồi',
      message: 'Thoát chế độ máy quầy trên máy này? Sau đó chủ cửa hàng / quản lý đăng nhập để đặt lại.',
      confirmText: 'Thoát',
      destructive: true,
    });
    if (!ok) return;
    await leaveCounterMode();
    router.replace('/');
  }

  if (!device) return null;

  const dateLabel = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
  const timeLabel = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top + 8 }}>
      {/* Đầu màn: cửa hàng, máy quầy, giờ */}
      <View className="flex-row items-center justify-between px-4 pb-3">
        <View className="flex-1 pr-3">
          <Text variant="title2" numberOfLines={1}>{store?.name ?? 'Máy quầy'}</Text>
          <Text tone="muted" numberOfLines={1}>{device.deviceName} · {rosterQ.data?.branchName || device.branchName}</Text>
        </View>
        <View className="items-end">
          <Text variant="title2">{timeLabel}</Text>
          <Text tone="muted" variant="caption" className="capitalize">{dateLabel}</Text>
        </View>
      </View>

      {pending ? (
        <CodeEntry
          pending={pending}
          wide={width >= 720}
          onCancel={() => setPending(null)}
          onResend={() => choose(pending.person)}
          onSignedIn={async (auth) => {
            await loginWithAuthResponse(auth);
            setPending(null);
            router.replace('/');
          }}
        />
      ) : revoked ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Icon name="lock-alert-outline" size={56} tone="error" />
          <Text variant="headline" className="text-center">Máy quầy đã bị thu hồi</Text>
          <Text tone="muted" className="text-center">Chủ cửa hàng / quản lý đã gỡ máy này trên trang quản trị.</Text>
          <Button action="neutral" variant="outline" onPress={leave}>Thoát chế độ máy quầy</Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, alignSelf: 'center', width: '100%', maxWidth: 1280 }}
          refreshControl={<RefreshControl refreshing={rosterQ.isRefetching} onRefresh={() => rosterQ.refetch()} />}
        >
          <Text variant="headline" className="mb-1">Chọn tên của bạn để đăng nhập</Text>
          <Text tone="muted" className="mb-4">Mã 6 số sẽ gửi về app trên điện thoại của bạn.</Text>

          {rosterQ.isLoading ? (
            <View className="py-16 items-center"><Spinner /></View>
          ) : rosterQ.isError ? (
            <View className="py-16 items-center gap-3">
              <Text tone="muted" className="text-center">{rosterError?.message}</Text>
              <Button variant="outline" onPress={() => rosterQ.refetch()}>Thử lại</Button>
            </View>
          ) : groups.length === 0 ? (
            <View className="py-16 items-center gap-2">
              <Icon name="calendar-blank-outline" size={48} tone="muted" />
              <Text tone="muted" className="text-center">Chưa có ai có ca hôm nay ở chi nhánh này.</Text>
            </View>
          ) : (
            groups.map(([status, list]) => (
              <View key={status} className="mb-5">
                <Text variant="footnote" tone="muted" className="uppercase mb-2">{STATUS_LABEL[status]} · {list.length}</Text>
                <View className="flex-row flex-wrap" style={{ gap }}>
                  {list.map((p) => (
                    <PersonCard
                      key={p.userId}
                      person={p}
                      width={cardWidth}
                      busy={sending === p.userId}
                      disabled={!!sending}
                      onPress={() => choose(p)}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function PersonCard({
  person,
  width,
  busy,
  disabled,
  onPress,
}: {
  person: CounterPerson;
  width: number;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const dim = !person.canSignIn;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ width }}
      className={cn(
        'rounded-2xl bg-surface dark:bg-surface-dark p-4 items-center gap-2 border border-line dark:border-line-dark',
        dim && 'opacity-50'
      )}
    >
      <Avatar name={person.fullName} uri={person.avatarUrl ? getStorageUrl(person.avatarUrl) : undefined} size={64} />
      <Text variant="headline" numberOfLines={1} className="text-center">{person.fullName}</Text>
      <Text variant="caption" tone="muted" numberOfLines={1} className="text-center">{roleLabel(person)}</Text>
      {busy ? (
        <Spinner />
      ) : !person.hasApp && person.canSignIn ? (
        <Text variant="caption" tone="warning" className="text-center">Chưa có app trên điện thoại</Text>
      ) : null}
    </Pressable>
  );
}

function CodeEntry({
  pending,
  wide,
  onCancel,
  onResend,
  onSignedIn,
}: {
  pending: Pending;
  wide: boolean;
  onCancel: () => void;
  onResend: () => void;
  onSignedIn: (auth: Awaited<ReturnType<typeof verifyCounterLogin>>) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const submitted = useRef<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setCode('');
    setError(null);
    submitted.current = null;
  }, [pending.requestId]);

  const secondsLeft = Math.max(0, Math.ceil((pending.expiresAt - tick) / 1000));
  const resendIn = Math.max(0, Math.ceil((pending.resendAt - tick) / 1000));
  const expired = secondsLeft === 0;

  const submit = useCallback(
    async (value: string) => {
      if (submitted.current === value) return;
      submitted.current = value;
      setChecking(true);
      setError(null);
      try {
        const auth = await verifyCounterLogin(pending.requestId, value);
        await onSignedIn(auth);
      } catch (err) {
        const e = err as CounterError;
        setError(e.message);
        setCode('');
        submitted.current = null;
      } finally {
        setChecking(false);
      }
    },
    [pending.requestId, onSignedIn]
  );

  function press(key: string) {
    if (checking || expired) return;
    if (key === 'del') {
      setCode((c) => c.slice(0, -1));
      return;
    }
    setCode((c) => {
      if (c.length >= CODE_LENGTH) return c;
      const next = c + key;
      if (next.length === CODE_LENGTH) void submit(next);
      return next;
    });
  }

  const info = (
    <View className={cn('items-center gap-2', wide ? 'flex-1 pr-6' : 'mb-4')}>
      <Avatar name={pending.person.fullName} uri={pending.person.avatarUrl ? getStorageUrl(pending.person.avatarUrl) : undefined} size={wide ? 96 : 72} />
      <Text variant="title2" className="text-center">{pending.person.fullName}</Text>
      <Text tone="muted" className="text-center">
        Mã đã gửi tới app trên {pending.sentTo > 1 ? `${pending.sentTo} thiết bị` : 'điện thoại'} của bạn.
      </Text>
      <Text tone={expired ? 'error' : 'muted'} className="text-center">
        {expired ? 'Mã đã hết hạn.' : `Hết hạn sau ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
      </Text>
      <View className="flex-row gap-2 mt-2">
        <Button variant="outline" action="neutral" onPress={onCancel}>Chọn người khác</Button>
        <Button variant="soft" disabled={resendIn > 0} onPress={onResend}>
          {resendIn > 0 ? `Gửi lại (${resendIn}s)` : 'Gửi lại mã'}
        </Button>
      </View>
    </View>
  );

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  const keySize = wide ? 84 : 72;

  const pad = (
    <View className={cn('items-center', wide && 'flex-1')}>
      <View className="flex-row gap-2 mb-3">
        {Array.from({ length: CODE_LENGTH }).map((_, i) => (
          <View
            key={i}
            className={cn(
              'items-center justify-center rounded-xl border-2',
              code.length === i ? 'border-primary' : 'border-line dark:border-line-dark'
            )}
            style={{ width: 48, height: 58 }}
          >
            <Text variant="title2">{code[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      <View style={{ minHeight: 22 }} className="mb-2">
        {checking ? <Spinner /> : error ? <Text tone="error" className="text-center">{error}</Text> : null}
      </View>
      <View className="flex-row flex-wrap justify-center" style={{ width: keySize * 3 + 24, gap: 12 }}>
        {keys.map((k, i) =>
          k === '' ? (
            <View key={i} style={{ width: keySize, height: keySize }} />
          ) : (
            <Pressable
              key={i}
              onPress={() => press(k)}
              disabled={checking || expired}
              style={{ width: keySize, height: keySize }}
              className="rounded-full items-center justify-center bg-surface dark:bg-surface-dark border border-line dark:border-line-dark"
            >
              {k === 'del' ? <Icon name="backspace-outline" size={28} /> : <Text variant="title">{k}</Text>}
            </Pressable>
          )
        )}
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, flexGrow: 1, justifyContent: 'center' }}>
      <View className={cn(wide ? 'flex-row items-center' : '')} style={{ alignSelf: 'center', width: '100%', maxWidth: 980 }}>
        {info}
        {pad}
      </View>
    </ScrollView>
  );
}

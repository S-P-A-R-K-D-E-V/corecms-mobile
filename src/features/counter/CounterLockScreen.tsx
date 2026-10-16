import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Avatar, Button, Icon, Pressable, Spinner, Text, cn } from 'src/components/ui';
import { confirm, toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { getStorageUrl } from 'src/api/axios';
import {
  counterPasswordLogin,
  getCounterRoster,
  requestCounterLogin,
  verifyCounterLogin,
  type CounterError,
  type CounterPerson,
} from 'src/api/counter';
import { leaveCounterMode, useCounterMode } from 'src/services/counter-mode';
import { CounterQrPanel } from './CounterQrPanel';
import { getStore } from 'src/services/store-config';
import { PasswordField } from 'src/features/auth/SignInControls';
import { t, useT } from 'src/i18n';
import type { IAuthResponse } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Màn khoá máy quầy: người có ca hôm nay ở chi nhánh (+ chủ cửa hàng / quản lý). Bấm tên → mã 6 số gửi về app
// điện thoại của người đó → nhập mã trên bàn phím số → vào app. Thiết kế cho POS / tablet ngang (lưới nhiều cột,
// bàn phím lớn) nhưng vẫn dùng được trên màn dọc. Người không có app trên điện thoại: chọn tên rồi nhập mật khẩu tài
// khoản (sai 5 lần khoá 15 phút trên máy này — server đếm). Ca chưa gắn chi nhánh (cửa hàng nhiều chi nhánh) xếp
// riêng cuối danh sách để người khác chi nhánh không lẫn vào.

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

// Ca chưa gắn chi nhánh vẫn là người đứng quầy hôm nay → ngay sau người của chi nhánh, trước quản lý / người hết ca.
const GROUP_ORDER = ['working', 'upcoming', 'otherBranch', 'manager', 'ended'] as const;

function roleLabel(p: CounterPerson): string {
  if (p.role === 'Admin') return t('counter.roleOwner');
  if (p.role === 'Manager') return t('counter.roleManager');
  return p.startTime && p.endTime ? `${p.shiftName ? `${p.shiftName} · ` : ''}${p.startTime}–${p.endTime}` : t('counter.roleStaff');
}

function mmss(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Cùng chi nhánh theo trạng thái ca; ca chưa gắn chi nhánh (atThisBranch = false) gom riêng, trước quản lý. */
export function groupRoster(people: CounterPerson[]): [string, CounterPerson[]][] {
  const here = people.filter((p) => p.atThisBranch !== false);
  const groups: [string, CounterPerson[]][] = GROUP_ORDER.map((key) => [
    key,
    key === 'otherBranch' ? people.filter((p) => p.atThisBranch === false) : here.filter((p) => p.status === key),
  ]);
  return groups.filter(([, list]) => list.length > 0);
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
  const tr = useT();
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
  const [qrMode, setQrMode] = useState(false);
  const [passwordFor, setPasswordFor] = useState<CounterPerson | null>(null);

  const people = rosterQ.data?.people;
  const groups = useMemo(() => groupRoster(people ?? []), [people]);

  const columns = width >= 1100 ? 5 : width >= 840 ? 4 : width >= 600 ? 3 : 2;
  const gap = 12;
  const cardWidth = Math.floor((Math.min(width, 1280) - 32 - gap * (columns - 1)) / columns);

  async function signedIn(auth: IAuthResponse) {
    await loginWithAuthResponse(auth);
    setPending(null);
    setPasswordFor(null);
    setQrMode(false);
    router.replace('/');
  }

  async function choose(person: CounterPerson) {
    if (!person.canSignIn) {
      toast.info(person.status === 'ended' ? t('counter.shiftEnded') : t('counter.tooEarly'));
      return;
    }
    // Không có app trên điện thoại (không nhận được mã) → mật khẩu tài khoản.
    if (!person.hasApp) {
      setPending(null);
      setPasswordFor(person);
      return;
    }
    setSending(person.userId);
    try {
      const res = await requestCounterLogin(person.userId);
      const at = Date.now();
      setPasswordFor(null);
      setPending({
        person,
        requestId: res.requestId,
        expiresAt: at + res.expiresInSeconds * 1000,
        sentTo: res.sentToDevices,
        resendAt: at + RESEND_SECONDS * 1000,
      });
    } catch (err) {
      toast.error((err as CounterError).message ?? t('counter.sendFailed'));
    } finally {
      setSending(null);
    }
  }

  async function leave() {
    const ok = await confirm({
      title: t('counter.revokedTitle'),
      message: t('counter.revokedConfirm'),
      confirmText: t('counter.leaveShort'),
      destructive: true,
    });
    if (!ok) return;
    await leaveCounterMode();
    router.replace('/');
  }

  if (!device) return null;

  const dateLabel = dayjs(now).format('dddd, DD/MM');
  const timeLabel = dayjs(now).format('HH:mm');

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top + 8 }}>
      {/* Đầu màn: cửa hàng, máy quầy, giờ */}
      <View className="flex-row items-center justify-between px-4 pb-3">
        <View className="flex-1 pr-3">
          <Text variant="title2" numberOfLines={1}>{store?.name ?? tr('counter.fallbackTitle')}</Text>
          <Text tone="muted" numberOfLines={1}>{device.deviceName} · {rosterQ.data?.branchName || device.branchName}</Text>
        </View>
        <View className="items-end">
          <Text variant="title2">{timeLabel}</Text>
          <Text tone="muted" variant="caption" className="capitalize">{dateLabel}</Text>
        </View>
      </View>

      {qrMode ? (
        <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1, justifyContent: 'center' }}>
          <CounterQrPanel onCancel={() => setQrMode(false)} onSignedIn={signedIn} />
        </ScrollView>
      ) : passwordFor ? (
        <PasswordEntry
          person={passwordFor}
          onCancel={() => setPasswordFor(null)}
          onUseCode={() => choose(passwordFor)}
          onSignedIn={signedIn}
        />
      ) : pending ? (
        <CodeEntry
          pending={pending}
          wide={width >= 720}
          onCancel={() => setPending(null)}
          onResend={() => choose(pending.person)}
          onUsePassword={() => {
            setPending(null);
            setPasswordFor(pending.person);
          }}
          onSignedIn={signedIn}
        />
      ) : revoked ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Icon name="lock-alert-outline" size={56} tone="error" />
          <Text variant="headline" className="text-center">{tr('counter.revokedTitle')}</Text>
          <Text tone="muted" className="text-center">{tr('counter.revokedDesc')}</Text>
          <Button action="neutral" variant="outline" onPress={leave}>{tr('counter.leave')}</Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, alignSelf: 'center', width: '100%', maxWidth: 1280 }}
          refreshControl={<RefreshControl refreshing={rosterQ.isRefetching} onRefresh={() => rosterQ.refetch()} />}
        >
          {/* Màn hẹp (điện thoại dọc): chữ trên, nút dưới — xếp ngang thì nút chiếm gần hết hàng, chữ mỗi dòng một từ. */}
          <View className={cn('mb-4 gap-3', width >= 600 && 'flex-row items-start justify-between')}>
            <View className={width >= 600 ? 'flex-1' : undefined}>
              <Text variant="headline" className="mb-1">{tr('counter.pickTitle')}</Text>
              <Text tone="muted">{tr('counter.pickHint')}</Text>
            </View>
            <View className={width >= 600 ? undefined : 'self-start'}>
              <Button variant="soft" size="sm" fullWidth={false} onPress={() => setQrMode(true)}>
                {tr('counter.scanQr')}
              </Button>
            </View>
          </View>

          {rosterQ.isLoading ? (
            <View className="py-16 items-center"><Spinner /></View>
          ) : rosterQ.isError ? (
            <View className="py-16 items-center gap-3">
              <Text tone="muted" className="text-center">{rosterError?.message}</Text>
              <Button variant="outline" onPress={() => rosterQ.refetch()}>{tr('common.retry')}</Button>
            </View>
          ) : groups.length === 0 ? (
            <View className="py-16 items-center gap-2">
              <Icon name="calendar-blank-outline" size={48} tone="muted" />
              <Text tone="muted" className="text-center">{tr('counter.nobody')}</Text>
            </View>
          ) : (
            groups.map(([status, list]) => (
              <View key={status} className="mb-5">
                <Text variant="footnote" tone="muted" className="uppercase mb-2">{tr(`counter.status.${status}`)} · {list.length}</Text>
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
        <Text variant="caption" tone="warning" className="text-center">{t('counter.noAppPassword')}</Text>
      ) : null}
    </Pressable>
  );
}

function CodeEntry({
  pending,
  wide,
  onCancel,
  onResend,
  onUsePassword,
  onSignedIn,
}: {
  pending: Pending;
  wide: boolean;
  onCancel: () => void;
  onResend: () => void;
  onUsePassword: () => void;
  onSignedIn: (auth: IAuthResponse) => Promise<void>;
}) {
  const tr = useT();
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
        {pending.sentTo > 1 ? tr('counter.sentToDevices', { n: pending.sentTo }) : tr('counter.sentToPhone')}
      </Text>
      <Text tone={expired ? 'error' : 'muted'} className="text-center">
        {expired ? tr('counter.codeExpired') : tr('counter.expiresIn', { time: mmss(secondsLeft) })}
      </Text>
      <View className="flex-row gap-2 mt-2">
        <Button variant="outline" action="neutral" onPress={onCancel}>{tr('counter.pickOther')}</Button>
        <Button variant="soft" disabled={resendIn > 0} onPress={onResend}>
          {resendIn > 0 ? tr('counter.resendIn', { s: resendIn }) : tr('counter.resend')}
        </Button>
      </View>
      <Pressable onPress={onUsePassword} hitSlop={8} className="py-2">
        <Text tone="primary" className="text-center">{tr('counter.usePassword')}</Text>
      </Pressable>
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

function PasswordEntry({
  person,
  onCancel,
  onUseCode,
  onSignedIn,
}: {
  person: CounterPerson;
  onCancel: () => void;
  onUseCode: () => void;
  onSignedIn: (auth: IAuthResponse) => Promise<void>;
}) {
  const tr = useT();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setPassword('');
    setError(null);
  }, [person.userId]);

  async function submit() {
    if (!password || checking) return;
    setChecking(true);
    setError(null);
    try {
      const auth = await counterPasswordLogin(person.userId, password);
      await onSignedIn(auth);
    } catch (err) {
      // Counter.WrongPassword (kèm số lần còn lại) / Counter.PasswordLocked / Counter.NoPassword: server ghi sẵn câu hiển thị.
      setError((err as CounterError).message);
      setPassword('');
    } finally {
      setChecking(false);
    }
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, paddingBottom: 32, flexGrow: 1, justifyContent: 'center' }}
    >
      <View className="items-center gap-3" style={{ alignSelf: 'center', width: '100%', maxWidth: 440 }}>
        <Avatar name={person.fullName} uri={person.avatarUrl ? getStorageUrl(person.avatarUrl) : undefined} size={80} />
        <Text variant="title2" className="text-center">{person.fullName}</Text>
        <Text variant="headline" className="text-center">{tr('counter.passwordTitle')}</Text>
        <Text tone="muted" className="text-center">{tr('counter.passwordHint')}</Text>
        <View className="w-full">
          <PasswordField
            label={tr('counter.password')}
            value={password}
            onChangeText={setPassword}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={submit}
            // Máy quầy dùng chung: không để trình quản lý mật khẩu lưu / gợi ý mật khẩu của từng người.
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
          />
        </View>
        {error ? <Text tone="error" className="text-center">{error}</Text> : null}
        <View className="w-full gap-2">
          <Button loading={checking} disabled={!password} onPress={submit}>
            {tr('counter.signIn')}
          </Button>
          {person.hasApp ? (
            <Button variant="soft" onPress={onUseCode}>{tr('counter.useCode')}</Button>
          ) : null}
          <Button variant="outline" action="neutral" onPress={onCancel}>{tr('counter.pickOther')}</Button>
        </View>
      </View>
    </ScrollView>
  );
}

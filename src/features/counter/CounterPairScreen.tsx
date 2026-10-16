import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';

import { Screen, AppHeader } from 'src/components/shared';
import { Button, Icon, Spinner, Text } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { getCounterPairingStatus, requestCounterPairing, type CounterError } from 'src/api/counter';
import { enterCounterMode } from 'src/services/counter-mode';
import { getStore, getStoreCode } from 'src/services/store-config';
import { useT } from 'src/i18n';

// ----------------------------------------------------------------------
// Đặt máy này làm máy quầy mà KHÔNG đăng nhập quản lý trên máy (owner chốt 2026-10-16): máy xin mã ghép nối loại máy
// quầy và hiện 6 số; chủ cửa hàng / quản lý nhập mã ở web (Cài đặt cửa hàng → Thiết bị cửa hàng) hoặc ở app trên điện
// thoại của họ (Hồ sơ → Ghép nối thiết bị). Được duyệt → máy nhận key (đúng một lần) và chuyển sang màn chọn tên.
// PairingId (để hỏi trạng thái / lấy key) chỉ máy này giữ, không hiện ra màn hình.
// ----------------------------------------------------------------------

const POLL_MS = 2500;
const MAX_RENEWALS = 6;

type Phase = 'loading' | 'waiting' | 'expired' | 'error' | 'missed';

export function CounterPairScreen() {
  const t = useT();
  const [pairing, setPairing] = useState<{ pairingId: string; code: string } | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const renewals = useRef(0);
  const alive = useRef(true);

  const start = useCallback(async (auto = false) => {
    renewals.current = auto ? renewals.current + 1 : 0;
    setPhase('loading');
    setError(null);
    try {
      const res = await requestCounterPairing(Platform.OS === 'ios' ? 'ios' : 'android');
      if (!alive.current) return;
      setPairing({ pairingId: res.pairingId, code: res.code });
      setPhase('waiting');
    } catch (err) {
      if (!alive.current) return;
      setError((err as CounterError).message);
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void start();
    return () => {
      alive.current = false;
    };
  }, [start]);

  useEffect(() => {
    if (!pairing || phase !== 'waiting') return undefined;
    let busy = false;
    const id = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await getCounterPairingStatus(pairing.pairingId);
        if (!alive.current) return;
        if (res.status === 'claimed') {
          clearInterval(id);
          if (res.kioskKey && res.deviceId && res.branchId) {
            await enterCounterMode(
              {
                deviceId: res.deviceId,
                deviceName: res.deviceName ?? t('counter.fallbackTitle'),
                branchId: res.branchId,
                branchName: res.branchName ?? '',
                storeCode: getStoreCode(),
              },
              res.kioskKey
            );
            toast.success(`${res.deviceName ?? ''} · ${res.branchName ?? ''}`, t('counter.setup.done'));
            router.replace('/counter' as any);
          } else {
            setPhase('missed');
          }
        } else if (res.status === 'expired') {
          clearInterval(id);
          if (renewals.current < MAX_RENEWALS) void start(true);
          else setPhase('expired');
        }
      } catch {
        // Lỗi mạng tạm thời — lần sau hỏi lại.
      } finally {
        busy = false;
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [pairing, phase, start, t]);

  const storeName = getStore()?.name ?? '';

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader back title={t('counter.pair.title')} subtitle={storeName || undefined} />
      <View className="items-center gap-4 py-6">
        <Icon name="cash-register" size={48} tone="primary" />
        {phase === 'loading' ? <Spinner /> : null}

        {phase === 'waiting' && pairing ? (
          <>
            <Text tone="muted" className="text-center px-4">{t('counter.pair.hint')}</Text>
            <Text style={{ fontSize: 56, lineHeight: 64, letterSpacing: 10, fontWeight: '700' }}>
              {pairing.code.slice(0, 3)} {pairing.code.slice(3)}
            </Text>
            <View className="flex-row items-center gap-2">
              <Spinner />
              <Text variant="caption" tone="muted">{t('counter.pair.waiting')}</Text>
            </View>
          </>
        ) : null}

        {phase === 'expired' || phase === 'error' || phase === 'missed' ? (
          <>
            <Text tone={phase === 'error' ? 'error' : 'muted'} className="text-center px-4">
              {phase === 'error' ? error : phase === 'expired' ? t('counter.pair.expired') : t('counter.pair.missed')}
            </Text>
            <Button variant="soft" fullWidth={false} onPress={() => void start()}>{t('counter.pair.newCode')}</Button>
          </>
        ) : null}

        <Text variant="caption" tone="faint" className="text-center px-6">{t('counter.pair.quickHint')}</Text>
      </View>
    </Screen>
  );
}

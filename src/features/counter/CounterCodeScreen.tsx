import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Screen } from 'src/components/shared';
import { Button, Icon, Text } from 'src/components/ui';
import { useT } from 'src/i18n';

// ----------------------------------------------------------------------
// Điện thoại của nhân viên: bấm thông báo "Mã đăng nhập máy quầy" → hiện mã thật to để gõ vào máy quầy.
// Mã hết hạn sau 2 phút kể từ lúc gửi (CounterLoginPolicy.CodeLifetime phía server).

const LIFETIME_MS = 2 * 60 * 1000;

function receivedAt(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  return n < 1e12 ? n * 1000 : n; // iOS báo giây, Android mili giây
}

export function CounterCodeScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ code?: string; device?: string; branch?: string; at?: string }>();
  const code = (params.code ?? '').replace(/\D/g, '').slice(0, 6);
  const [now, setNow] = useState(Date.now());
  const expiresAt = receivedAt(params.at) + LIFETIME_MS;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const place = [params.device, params.branch].filter(Boolean).join(' · ');

  return (
    <Screen tabBarInset={false}>
      <View className="flex-1 items-center justify-center gap-4 px-8">
        <Icon name="cash-register" size={48} tone="primary" />
        <Text variant="headline" className="text-center">{t('counter.code.title')}</Text>
        {place ? <Text tone="muted" className="text-center">{place}</Text> : null}
        <Text style={{ fontSize: 56, lineHeight: 64, letterSpacing: 10, fontWeight: '700' }} tone={left ? 'default' : 'faint'}>
          {code.slice(0, 3)} {code.slice(3)}
        </Text>
        <Text tone={left ? 'muted' : 'error'} className="text-center">
          {left
            ? t('counter.code.enterOnCounter', { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` })
            : t('counter.code.expired')}
        </Text>
        <Text variant="caption" tone="muted" className="text-center">{t('counter.code.notYou')}</Text>
        <Button variant="outline" action="neutral" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          {t('common.close')}
        </Button>
      </View>
    </Screen>
  );
}

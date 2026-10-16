import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import dayjs from 'dayjs';

import { Screen, SectionCard, ListItem, AppHeader } from 'src/components/shared';
import { Avatar, Text } from 'src/components/ui';
import { confirm } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { isManagerUser } from 'src/auth/roles';
import { ACCESS_TOKEN_KEY } from 'src/api/session';
import { unpairCounter } from 'src/api/counter';
import { leaveCounterMode, tokenExpiresAt, useCounterMode } from 'src/services/counter-mode';
import { availableFeatures, featureLabel } from 'src/features/launcher/registry';
import { useFeatureContext } from 'src/features/launcher/feature-context';
import { useT } from 'src/i18n';

// ----------------------------------------------------------------------
// Máy quầy: tab "Tiện ích" và màn Hồ sơ thay bằng menu rút gọn — tính năng bán hàng của quầy, người đang dùng máy
// + giờ phiên tự hết, kết thúc phiên (về màn chọn tên), thoát chế độ máy quầy (chủ cửa hàng / quản lý). Không có
// hồ sơ cá nhân, liên kết tài khoản, thiết bị đăng nhập… — những việc đó làm trên điện thoại / web cá nhân.
// ----------------------------------------------------------------------

export function CounterMenuScreen() {
  const t = useT();
  const { user, logout } = useAuthContext();
  const counter = useCounterMode((s) => s.device);
  const ctx = useFeatureContext();
  const features = availableFeatures(user, ctx);
  const [endsAt, setEndsAt] = useState<number | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
      .then((token) => setEndsAt(tokenExpiresAt(token)))
      .catch(() => setEndsAt(null));
  }, [user?.id]);

  const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();

  async function endSession() {
    const ok = await confirm({
      title: t('counter.menu.endTitle'),
      message: t('counter.menu.endMessage'),
      confirmText: t('counter.menu.end'),
    });
    if (!ok) return;
    try { await logout(); } catch {}
  }

  async function leave() {
    if (!counter) return;
    const ok = await confirm({
      title: t('counter.profile.leaveTitle'),
      message: t('counter.profile.leaveMessage', { device: counter.deviceName, branch: counter.branchName }),
      confirmText: t('counter.leave'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await unpairCounter();
    } catch {
      // Máy đã bị thu hồi trên web / mất mạng: vẫn thoát ở máy này.
    }
    await leaveCounterMode();
    try { await logout(); } catch {}
  }

  return (
    <Screen scroll>
      <AppHeader title={t('counter.menu.title')} subtitle={counter ? `${counter.deviceName} · ${counter.branchName}` : undefined} />

      <SectionCard title={t('counter.menu.signedIn')} bodyClassName="flex-row items-center gap-3">
        <Avatar name={name} uri={user?.photoURL} size={56} />
        <View className="flex-1">
          <Text variant="headline" numberOfLines={1}>{name || user?.email}</Text>
          <Text tone="muted" numberOfLines={1}>
            {endsAt ? t('counter.menu.endsAt', { time: dayjs(endsAt).format('HH:mm') }) : t('counter.menu.signedIn')}
          </Text>
        </View>
      </SectionCard>

      <SectionCard title={t('counter.menu.features')} bodyClassName="pt-0">
        {features.map((f) => (
          <ListItem key={f.key} title={featureLabel(f)} icon={f.icon} iconTone="primary" onPress={() => router.push(f.href as any)} showChevron />
        ))}
      </SectionCard>

      <SectionCard title={t('counter.menu.session')} bodyClassName="pt-0">
        <ListItem title={t('counter.menu.language')} icon="translate" onPress={() => router.push('/settings/language' as any)} showChevron />
        <ListItem title={t('counter.menu.end')} subtitle={t('counter.menu.endHint')} icon="logout" iconTone="warning" onPress={endSession} />
        {isManagerUser(user) ? (
          <ListItem
            title={t('counter.leave')}
            subtitle={counter ? `${counter.deviceName} · ${counter.branchName}` : undefined}
            icon="cash-register"
            iconTone="error"
            onPress={leave}
          />
        ) : null}
      </SectionCard>

      <Text variant="caption" tone="muted" className="text-center px-6">{t('counter.menu.note')}</Text>
    </Screen>
  );
}

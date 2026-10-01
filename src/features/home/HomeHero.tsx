import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { Text, Icon, Pressable, Avatar, BrandGradient, type IconName } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { canUseAssistant, assistantEnabled } from 'src/auth/roles';
import { getStore } from 'src/services/store-config';
import { useMessengerStore } from 'src/store/messenger-store';
import { getUnreadCount } from 'src/api/notifications';
import { haptics } from 'src/services/haptics';
import { t } from 'src/i18n';

import { HIDDEN_AMOUNT } from './hooks';

// ----------------------------------------------------------------------
// Đầu trang chủ kiểu MB Bank: khối màu cửa hàng tràn dưới thanh trạng thái, avatar (→ Tài khoản),
// lời chào, nút Tin nhắn / Trợ lý AI / Thông báo (đã rời thanh tab), và "thẻ số dư" do màn truyền vào.
// Phần dưới chừa chỗ để thẻ Dùng nhanh đè lên mép.
// ----------------------------------------------------------------------

export const HERO_OVERLAP = 52;

const GLASS = 'rgba(255,255,255,0.16)';
const WHITE_70 = 'rgba(255,255,255,0.72)';

function HeaderButton({ icon, badge, label, onPress }: { icon: IconName; badge?: number; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityLabel={label}
      hitSlop={4}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: GLASS, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={icon} size={21} color="#FFFFFF" />
      {badge ? (
        <View
          style={{ position: 'absolute', top: 4, right: 3, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8 }}
          className="bg-error items-center justify-center"
        >
          <Text tone="inverse" className="text-[9px] font-bold">{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function HomeHero({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  const { user } = useAuthContext();
  const fullName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  const storeName = getStore()?.name ?? null;

  const chatUnread = useMessengerStore((s) => s.conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0));
  const notifQ = useQuery({ queryKey: ['notifications', 'unread-count'], queryFn: getUnreadCount, staleTime: 60_000 });
  const showAssistant = canUseAssistant(user) && assistantEnabled(user);

  return (
    <BrandGradient
      style={{
        paddingTop: insets.top + 10,
        paddingBottom: HERO_OVERLAP + 18,
        paddingHorizontal: 16,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
      }}
    >
      {/* Chữ trắng trên nền màu → thanh trạng thái sáng khi đang ở trang chủ. */}
      {focused ? <StatusBar style="light" /> : null}

      {/* Vòng trang trí mờ như thẻ ngân hàng */}
      <View pointerEvents="none" style={{ position: 'absolute', right: -60, top: -40, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.07)' }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: -70, bottom: -90, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)' }} />

      <View className="flex-row items-center gap-3">
        <Pressable onPress={() => router.push('/(tabs)/profile' as any)} accessibilityLabel={t('home.profile')}>
          <View style={{ padding: 2, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.35)' }}>
            <Avatar name={fullName} uri={user?.photoURL} size={40} />
          </View>
        </Pressable>
        <View className="flex-1">
          <Text variant="caption" style={{ color: WHITE_70 }} numberOfLines={1}>
            {storeName ?? t('home.hello')}
          </Text>
          <Text variant="headline" tone="inverse" numberOfLines={1}>{fullName || user?.email}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <HeaderButton icon="chat-processing-outline" badge={chatUnread} label={t('home.chat')} onPress={() => router.push('/(tabs)/chat' as any)} />
          {showAssistant ? (
            <HeaderButton icon="robot-happy-outline" label={t('home.assistant')} onPress={() => router.push('/(tabs)/assistant' as any)} />
          ) : null}
          <HeaderButton icon="bell-outline" badge={notifQ.data} label={t('home.notifications')} onPress={() => router.push('/notifications' as any)} />
        </View>
      </View>

      <View style={{ marginTop: 18 }}>{children}</View>
    </BrandGradient>
  );
}

// ── Mảnh dùng chung cho thẻ số dư ────────────────────────────────────

export function HeroLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="bodySmall" style={{ color: WHITE_70 }} numberOfLines={1}>
      {children}
    </Text>
  );
}

/** Số tiền lớn có nút mắt ẩn/hiện (ẩn = ••••••). */
export function HeroAmount({ value, hidden, onToggle, size = 30 }: { value: string; hidden?: boolean; onToggle?: () => void; size?: number }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <Text
        tone="inverse"
        className="font-bold"
        style={{ fontSize: size, lineHeight: size + 6, fontVariant: ['tabular-nums'], letterSpacing: hidden ? 2 : -0.4 }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {hidden ? HIDDEN_AMOUNT : value}
      </Text>
      {onToggle ? <EyeToggle hidden={!!hidden} onToggle={onToggle} /> : null}
    </View>
  );
}

export function EyeToggle({ hidden, onToggle, small }: { hidden: boolean; onToggle: () => void; small?: boolean }) {
  const s = small ? 26 : 30;
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onToggle();
      }}
      hitSlop={10}
      accessibilityLabel={hidden ? t('home.showAmount') : t('home.hideAmount')}
      style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: GLASS, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={hidden ? 'eye-off-outline' : 'eye-outline'} size={small ? 15 : 17} color="#FFFFFF" />
    </Pressable>
  );
}

/** Hàng chỉ số nhỏ dưới đáy thẻ số dư, ngăn bằng vạch mờ. */
export function HeroStats({ items }: { items: { label: string; value: React.ReactNode; right?: React.ReactNode }[] }) {
  return (
    <View
      style={{ marginTop: 16, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}
      className="flex-row"
    >
      {items.map((it, i) => (
        <View
          key={it.label}
          style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 12, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: 'rgba(255,255,255,0.14)' }}
        >
          <Text variant="caption" style={{ color: WHITE_70 }} numberOfLines={1}>{it.label}</Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            <Text tone="inverse" className="font-bold text-[15px]" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
              {it.value}
            </Text>
            {it.right ?? null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function HeroChip({ icon, children }: { icon?: IconName; children: React.ReactNode }) {
  return (
    <View
      className="flex-row items-center self-start gap-1 mt-2"
      style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: GLASS }}
    >
      {icon ? <Icon name={icon} size={13} color="#FFFFFF" /> : null}
      <Text variant="caption" tone="inverse" className="font-semibold">{children}</Text>
    </View>
  );
}

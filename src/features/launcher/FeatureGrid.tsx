import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { router } from 'expo-router';

import { SectionCard } from 'src/components/shared';
import { Text, Icon, Pressable } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { haptics } from 'src/services/haptics';
import { useAuthContext } from 'src/auth/auth-context';
import { useResponsive } from 'src/hooks/use-responsive';
import { brand } from 'src/theme';

import { featureLabel, visiblePins, type FeatureItem, type FeatureTone, type LauncherVariant } from './registry';
import { t } from 'src/i18n';
import { useLauncherStore } from './store';
import { useFeatureContext } from './feature-context';
import { LauncherEditor } from './LauncherEditor';

// Nền ô icon theo tone (class tĩnh để tailwind sinh được).
const TONE_BG: Record<FeatureTone, string> = {
  primary: 'bg-primary-soft',
  info: 'bg-info-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  secondary: 'bg-secondary-soft',
};

// ----------------------------------------------------------------------

// Tối đa 8 ô: 4 cột (2 hàng) trên điện thoại, 8 cột (1 hàng) trên tablet.
function columnsFor(width: number) {
  return width >= 600 ? 8 : 4;
}

function FeatureTile({ item, columns }: { item: FeatureItem; columns: number }) {
  // Tính năng đang phát triển: nút vẫn hiển thị nhưng DISABLED — không điều
  // hướng (tránh lỗi route chưa tồn tại), chỉ mờ đi + tag "Đang phát triển".
  const disabled = !!item.comingSoon;
  const tone = item.tone ?? 'primary';

  function onPress() {
    haptics.light();
    router.push(item.href as any);
  }

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={{ width: `${100 / columns}%` }}
      className={cn('items-center gap-1.5 py-2', disabled && 'opacity-45')}
    >
      <View className={cn('w-[52px] h-[52px] rounded-2xl items-center justify-center relative', TONE_BG[tone])}>
        <Icon name={item.icon} size={26} tone={disabled ? 'faint' : tone} />
      </View>
      {disabled ? (
        <View className="rounded-full px-1.5 py-px bg-warning-soft -mt-0.5">
          {/* nano + cỡ 8px cố định: chip hẹp dưới ô icon — không mang lineHeight 22px của 'body' nữa. */}
          <Text variant="nano" className="text-warning-text font-bold" style={{ fontSize: 8, lineHeight: 10 }} numberOfLines={1}>
            {t('launcher.comingSoon')}
          </Text>
        </View>
      ) : null}
      <Text variant="caption" numberOfLines={2} className="text-center text-[11px] leading-[13px]">
        {featureLabel(item)}
      </Text>
    </Pressable>
  );
}

/** "Dùng nhanh" (trang chủ) / ghim ở Tiện ích: tối đa 8 tiện ích ghim, nút Tùy chỉnh mở màn sắp xếp. */
export function FeatureGrid({
  variant,
  title,
  onSeeAll,
  solid,
}: {
  variant: LauncherVariant;
  title?: string;
  onSeeAll?: () => void;
  /** Nền đặc (không kính mờ) — khi thẻ đè lên khối màu đầu trang chủ. */
  solid?: boolean;
}) {
  const { colorScheme } = useColorScheme();
  const { user } = useAuthContext();
  const [editing, setEditing] = useState(false);
  const pinKeys = useLauncherStore((s) => s.pins[variant]);
  const { width } = useResponsive();
  const columns = columnsFor(width);

  // Chỉ hiện tiện ích user được phép (lọc role) và đang ghim, giữ đúng thứ tự ghim, tối đa 8.
  const ctx = useFeatureContext();
  const pinned = useMemo(() => visiblePins(pinKeys, user, ctx), [pinKeys, user, ctx]);

  return (
    <>
      <SectionCard
        style={solid ? { backgroundColor: colorScheme === 'dark' ? brand.surfaceDark : brand.surface } : undefined}
        title={title ?? t('launcher.title')}
        icon="apps"
        right={
          <View className="flex-row items-center gap-1.5">
            <Pressable
              onPress={() => setEditing(true)}
              hitSlop={8}
              className="flex-row items-center gap-1 px-2 py-1 rounded-full bg-primary-soft"
            >
              <Icon name="tune-variant" size={14} tone="primary" />
              <Text variant="caption" tone="primary" className="font-semibold">{t('launcher.customize')}</Text>
            </Pressable>
            {onSeeAll ? (
              <Pressable onPress={onSeeAll} hitSlop={8} className="flex-row items-center px-1 py-1">
                <Text variant="caption" tone="muted" className="font-semibold">{t('home.seeAll')}</Text>
                <Icon name="chevron-right" size={16} tone="muted" />
              </Pressable>
            ) : null}
          </View>
        }
      >
        {pinned.length === 0 ? (
          <Pressable onPress={() => setEditing(true)} className="items-center py-4 gap-1">
            <Icon name="apps" size={28} tone="faint" />
            <Text variant="bodySmall" tone="muted">{t('launcher.emptyPinned')}</Text>
          </Pressable>
        ) : (
          <View className="flex-row flex-wrap">
            {pinned.map((item) => (
              <FeatureTile key={item.key} item={item} columns={columns} />
            ))}
          </View>
        )}
      </SectionCard>

      <LauncherEditor variant={variant} visible={editing} onClose={() => setEditing(false)} />
    </>
  );
}

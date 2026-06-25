import { View } from 'react-native';

import { Screen, AppHeader, SectionCard, ToggleRow, Loading } from 'src/components/shared';
import { Text, Icon, Divider } from 'src/components/ui';
import { useNotificationSettings, type NotificationPreferences } from 'src/hooks/use-notification-settings';
import { brand } from 'src/theme';
import type { IconName } from 'src/components/ui';

type CategoryKey = keyof NotificationPreferences['categories'];

const CATEGORIES: { key: CategoryKey; label: string; desc: string; icon: IconName; color: string }[] = [
  { key: 'Messages', label: 'Tin nhắn', desc: 'Thông báo khi có tin nhắn mới', icon: 'message-text-outline', color: brand.primary },
  { key: 'Shift', label: 'Ca làm việc', desc: 'Đổi ca, làm hộ, nhắc ca', icon: 'calendar-clock', color: brand.info },
  { key: 'Attendance', label: 'Chấm công', desc: 'Check-in/out, điều chỉnh giờ', icon: 'fingerprint', color: brand.primary },
  { key: 'Payroll', label: 'Bảng lương', desc: 'Kỳ lương mới, thanh toán', icon: 'cash-multiple', color: brand.success },
  { key: 'Leave', label: 'Nghỉ phép', desc: 'Yêu cầu nghỉ, duyệt nghỉ', icon: 'calendar-remove-outline', color: brand.warning },
  { key: 'System', label: 'Hệ thống', desc: 'Thông báo từ Admin, cập nhật', icon: 'cog-outline', color: brand.secondary },
];

export function NotificationSettingsScreen() {
  const { prefs, loaded, permissionStatus, updatePrefs, requestPermission } = useNotificationSettings();

  async function toggleGlobal(val: boolean) {
    if (val && permissionStatus !== 'granted') {
      const ok = await requestPermission();
      if (!ok) return;
    }
    await updatePrefs({ globalEnabled: val });
  }

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader title="Cài đặt thông báo" back />
      {!loaded ? (
        <Loading />
      ) : (
        <>
          {permissionStatus !== 'granted' ? (
            <View className="flex-row items-start gap-2 bg-warning-soft rounded-xl p-3">
              <Icon name="alert-outline" size={18} tone="warning" />
              <Text variant="caption" tone="warning" className="flex-1">
                Quyền thông báo chưa được cấp. Bật "Bật thông báo" để cấp quyền.
              </Text>
            </View>
          ) : null}

          <SectionCard title="Chung" bodyClassName="pt-0">
            <ToggleRow
              icon="bell-outline"
              iconColor={brand.error}
              title="Bật thông báo"
              description="Nhận tất cả thông báo từ ứng dụng"
              value={prefs.globalEnabled}
              onToggle={toggleGlobal}
            />
          </SectionCard>

          <SectionCard title="Loại thông báo" bodyClassName="pt-0">
            {CATEGORIES.map((cat, i) => (
              <View key={cat.key}>
                {i > 0 ? <Divider className="ml-12" /> : null}
                <ToggleRow
                  icon={cat.icon}
                  iconColor={cat.color}
                  title={cat.label}
                  description={cat.desc}
                  value={prefs.categories[cat.key]}
                  onToggle={(val) => updatePrefs({ categories: { ...prefs.categories, [cat.key]: val } })}
                  disabled={!prefs.globalEnabled}
                />
              </View>
            ))}
          </SectionCard>

          <SectionCard title="Hành vi" bodyClassName="pt-0">
            <ToggleRow icon="vibrate" iconColor={brand.muted} title="Rung" description="Rung khi nhận thông báo" value={prefs.vibrationEnabled} onToggle={(v) => updatePrefs({ vibrationEnabled: v })} disabled={!prefs.globalEnabled} />
            <Divider className="ml-12" />
            <ToggleRow icon="volume-high" iconColor={brand.muted} title="Âm thanh" description="Phát âm khi nhận thông báo" value={prefs.soundEnabled} onToggle={(v) => updatePrefs({ soundEnabled: v })} disabled={!prefs.globalEnabled} />
          </SectionCard>

          <Text variant="caption" tone="faint" className="px-1 leading-5">
            Cài đặt áp dụng ngay cho thông báo realtime trong ứng dụng.{'\n'}Để tắt thông báo hệ thống, vào Cài đặt → Ứng dụng → CoreCMS.
          </Text>
        </>
      )}
    </Screen>
  );
}

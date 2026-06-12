import { View, StyleSheet, ScrollView, Platform, Switch } from 'react-native';
import { Text, Surface, Divider, useTheme, ActivityIndicator, Appbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  useNotificationSettings,
  type NotificationPreferences,
} from 'src/hooks/use-notification-settings';

// ----------------------------------------------------------------------

type CategoryKey = keyof NotificationPreferences['categories'];

const CATEGORIES: { key: CategoryKey; label: string; desc: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string }[] = [
  { key: 'Shift',       label: 'Ca làm việc',    desc: 'Đổi ca, làm hộ, nhắc ca sắp tới',    icon: 'calendar-clock',          color: '#00B8D9' },
  { key: 'Attendance',  label: 'Chấm công',       desc: 'Check-in/out, điều chỉnh giờ',        icon: 'fingerprint',             color: '#00A76F' },
  { key: 'Payroll',     label: 'Bảng lương',      desc: 'Kỳ lương mới, thanh toán',           icon: 'cash-multiple',           color: '#22C55E' },
  { key: 'Leave',       label: 'Nghỉ phép',       desc: 'Yêu cầu nghỉ, duyệt nghỉ',          icon: 'calendar-remove-outline', color: '#FFAB00' },
  { key: 'System',      label: 'Hệ thống',        desc: 'Thông báo từ Admin, cập nhật',       icon: 'cog-outline',             color: '#8E33FF' },
];

// ----------------------------------------------------------------------

function SettingRow({
  icon,
  iconColor,
  title,
  description,
  value,
  onToggle,
  disabled,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor: string;
  title: string;
  description?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { opacity: disabled ? 0.5 : 1 }]}>
      <View style={[styles.iconWrap, { backgroundColor: `${iconColor}15` }]}>
        <MaterialCommunityIcons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.rowText}>
        <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.onSurface }}>{title}</Text>
        {!!description && (
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 1 }}>{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: '#E0E0E0', true: `${iconColor}60` }}
        thumbColor={value ? iconColor : '#BDBDBD'}
        style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] } : undefined}
      />
    </View>
  );
}

// ----------------------------------------------------------------------

export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const { prefs, loaded, permissionStatus, updatePrefs, requestPermission } = useNotificationSettings();

  async function toggleGlobal(val: boolean) {
    if (val && permissionStatus !== 'granted') {
      const ok = await requestPermission();
      if (!ok) return;
    }
    await updatePrefs({ globalEnabled: val });
  }

  async function toggleCategory(key: CategoryKey, val: boolean) {
    await updatePrefs({ categories: { ...prefs.categories, [key]: val } });
  }

  if (!loaded) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Cài đặt thông báo" titleStyle={{ fontWeight: 'bold' }} />
        </Appbar.Header>
        <ActivityIndicator style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Cài đặt thông báo" titleStyle={{ fontWeight: 'bold' }} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Permission warning */}
        {permissionStatus !== 'granted' && (
          <View style={[styles.warningBanner, { backgroundColor: '#FFF7CD' }]}>
            <MaterialCommunityIcons name="alert-outline" size={18} color="#B76E00" />
            <Text variant="labelSmall" style={{ color: '#7A4100', flex: 1, marginLeft: 8 }}>
              Quyền thông báo chưa được cấp. Bật "Bật thông báo" để cấp quyền.
            </Text>
          </View>
        )}

        {/* Master switch */}
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <SettingRow
            icon="bell-outline"
            iconColor="#FF5630"
            title="Bật thông báo"
            description="Nhận tất cả thông báo từ ứng dụng"
            value={prefs.globalEnabled}
            onToggle={toggleGlobal}
          />
        </Surface>

        {/* Categories */}
        <Text variant="labelMedium" style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
          LOẠI THÔNG BÁO
        </Text>
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          {CATEGORIES.map((cat, idx) => (
            <View key={cat.key}>
              <SettingRow
                icon={cat.icon}
                iconColor={cat.color}
                title={cat.label}
                description={cat.desc}
                value={prefs.categories[cat.key]}
                onToggle={(val) => toggleCategory(cat.key, val)}
                disabled={!prefs.globalEnabled}
              />
              {idx < CATEGORIES.length - 1 && <Divider style={{ marginLeft: 64 }} />}
            </View>
          ))}
        </Surface>

        {/* Behaviour */}
        <Text variant="labelMedium" style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
          HÀNH VI
        </Text>
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <SettingRow
            icon="vibrate"
            iconColor="#637381"
            title="Rung"
            description="Rung thiết bị khi nhận thông báo"
            value={prefs.vibrationEnabled}
            onToggle={(val) => updatePrefs({ vibrationEnabled: val })}
            disabled={!prefs.globalEnabled}
          />
          <Divider style={{ marginLeft: 64 }} />
          <SettingRow
            icon="volume-high"
            iconColor="#637381"
            title="Âm thanh"
            description="Phát âm khi nhận thông báo"
            value={prefs.soundEnabled}
            onToggle={(val) => updatePrefs({ soundEnabled: val })}
            disabled={!prefs.globalEnabled}
          />
        </Surface>

        {/* Info */}
        <Text variant="labelSmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
          Cài đặt thông báo áp dụng ngay lập tức cho thông báo realtime trong ứng dụng.
          {'\n'}Để tắt thông báo hệ thống, vào Cài đặt → Ứng dụng → CoreCMS.
        </Text>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ----------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 12 },

  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 10,
    marginBottom: 4,
  },

  sectionTitle: {
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 2,
    paddingHorizontal: 4,
    letterSpacing: 0.5,
  },

  card: { borderRadius: 16 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowText: { flex: 1, marginRight: 8 },

  hint: {
    paddingHorizontal: 4,
    lineHeight: 18,
    marginTop: 4,
  },
});

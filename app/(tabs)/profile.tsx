import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  Text, Avatar, Button, Card, List, Divider, useTheme, Surface,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuthContext } from 'src/auth/auth-context';

// ----------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  Admin: 'Quản trị viên',
  Manager: 'Quản lý',
  Staff: 'Nhân viên',
  User: 'Người dùng',
};

const ROLE_COLORS: Record<string, string> = {
  Admin: '#FF5630',
  Manager: '#8E33FF',
  Staff: '#00A76F',
  User: '#637381',
};

// ----------------------------------------------------------------------

type MenuItemProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  description: string;
  iconColor?: string;
  onPress: () => void;
};

function MenuItem({ icon, title, description, iconColor = '#00A76F', onPress }: MenuItemProps) {
  const theme = useTheme();
  return (
    <List.Item
      title={title}
      description={description}
      onPress={onPress}
      style={styles.listItem}
      titleStyle={{ fontWeight: '600', fontSize: 15 }}
      descriptionStyle={{ fontSize: 12 }}
      left={() => (
        <View style={[styles.iconWrap, { backgroundColor: `${iconColor}15` }]}>
          <MaterialCommunityIcons name={icon} size={22} color={iconColor} />
        </View>
      )}
      right={() => (
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={theme.colors.onSurfaceVariant}
          style={{ alignSelf: 'center' }}
        />
      )}
    />
  );
}

// ----------------------------------------------------------------------

export default function ProfileScreen() {
  const { user, logout } = useAuthContext();
  const theme = useTheme();

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : '??';

  const roleLabel = ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? 'Nhân viên';
  const roleColor = ROLE_COLORS[user?.role ?? ''] ?? '#637381';

  function handleLogout() {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất không?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch {}
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Avatar Header ── */}
        <Surface style={[styles.headerCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={[styles.avatarRing, { borderColor: `${theme.colors.primary}40` }]}>
            {user?.photoURL ? (
              <Avatar.Image size={80} source={{ uri: user.photoURL }} />
            ) : (
              <Avatar.Text
                size={80}
                label={initials}
                style={{ backgroundColor: theme.colors.primary }}
                labelStyle={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}
              />
            )}
          </View>
          <Text variant="headlineSmall" style={[styles.name, { color: theme.colors.onSurface }]}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {user?.email}
          </Text>
          <View style={styles.chipRow}>
            <View style={{ backgroundColor: `${roleColor}18`, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ color: roleColor, fontWeight: '700', fontSize: 12 }}>{roleLabel}</Text>
            </View>
          </View>
        </Surface>

        {/* ── Quick Stats ── */}
        <Surface style={[styles.statsCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="fingerprint" size={20} color={theme.colors.primary} />
              <Text variant="labelSmall" style={{ color: '#637381', marginTop: 4 }}>Điểm danh</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.colors.outline }]} />
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="calendar-clock" size={20} color="#00B8D9" />
              <Text variant="labelSmall" style={{ color: '#637381', marginTop: 4 }}>Lịch làm</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.colors.outline }]} />
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="cash-multiple" size={20} color="#22C55E" />
              <Text variant="labelSmall" style={{ color: '#637381', marginTop: 4 }}>Lương</Text>
            </View>
          </View>
        </Surface>

        {/* ── Tài khoản ── */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text variant="labelMedium" style={styles.sectionTitle}>TÀI KHOẢN</Text>
          <MenuItem
            icon="account-edit-outline"
            title="Chỉnh sửa thông tin"
            description="Họ tên, ảnh đại diện, CCCD, ngân hàng..."
            iconColor="#00A76F"
            onPress={() => router.push('/account/edit')}
          />
        </Card>

        {/* ── Menu nhân viên ── */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text variant="labelMedium" style={styles.sectionTitle}>CÔNG CỤ NHÂN VIÊN</Text>
          <MenuItem
            icon="bell-outline"
            title="Thông báo"
            description="Xem tất cả thông báo của bạn"
            iconColor="#FF5630"
            onPress={() => router.push('/notifications')}
          />
          <Divider style={{ marginLeft: 64 }} />
          <MenuItem
            icon="bell-cog-outline"
            title="Cài đặt thông báo"
            description="Chọn loại thông báo, rung, âm thanh"
            iconColor="#8E33FF"
            onPress={() => router.push('/notification-settings')}
          />
          <Divider style={{ marginLeft: 64 }} />
          <MenuItem
            icon="clipboard-text-outline"
            title="Yêu cầu chấm công"
            description="Xin nghỉ phép, điều chỉnh giờ vào/ra"
            iconColor="#00B8D9"
            onPress={() => router.push('/attendance')}
          />
          <Divider style={{ marginLeft: 64 }} />
          <MenuItem
            icon="calendar-sync-outline"
            title="Đăng ký ca làm"
            description="Xem lịch và đăng ký ca"
            iconColor="#8E33FF"
            onPress={() => router.push('/(tabs)/schedule')}
          />
          <Divider style={{ marginLeft: 64 }} />
          <MenuItem
            icon="swap-horizontal"
            title="Đổi ca"
            description="Đổi ca trực tiếp với đồng nghiệp"
            iconColor="#FFAB00"
            onPress={() => router.push('/shift-swap')}
          />
          <Divider style={{ marginLeft: 64 }} />
          <MenuItem
            icon="account-group-outline"
            title="Làm hộ ca"
            description="Đăng ca cần làm hộ hoặc nhận làm hộ"
            iconColor="#00B8D9"
            onPress={() => router.push('/shift-pool')}
          />
        </Card>

        {/* ── App Info ── */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text variant="labelMedium" style={styles.sectionTitle}>THÔNG TIN ỨNG DỤNG</Text>
          <List.Item
            title="Phiên bản"
            description="CoreCMS Mobile v1.0.0"
            style={styles.listItem}
            titleStyle={{ fontWeight: '600' }}
            left={() => (
              <View style={[styles.iconWrap, { backgroundColor: '#63738115' }]}>
                <MaterialCommunityIcons name="information-outline" size={22} color="#637381" />
              </View>
            )}
          />
        </Card>

        {/* ── Logout ── */}
        <Button
          mode="outlined"
          onPress={handleLogout}
          icon="logout"
          style={styles.logoutBtn}
          contentStyle={{ paddingVertical: 6, flexDirection: 'row-reverse' }}
          labelStyle={{ fontSize: 15, fontWeight: '600', color: '#FF5630' }}
        >
          Đăng xuất
        </Button>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ----------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 12 },

  headerCard: {
    alignItems: 'center',
    padding: 28,
    borderRadius: 20,
  },
  avatarRing: {
    borderWidth: 3,
    borderRadius: 50,
    padding: 4,
    marginBottom: 12,
  },
  name: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  chipRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },

  statsCard: {
    borderRadius: 16,
    paddingVertical: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: { alignItems: 'center', flex: 1 },
  statDivider: { width: 1, height: 36 },

  card: {
    borderRadius: 16,
    elevation: 1,
    overflow: 'hidden',
  },
  sectionTitle: {
    color: '#9EA3AE',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  listItem: { paddingVertical: 10 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    alignSelf: 'center',
  },

  logoutBtn: {
    borderRadius: 14,
    borderColor: '#FF563040',
    marginTop: 4,
  },
});

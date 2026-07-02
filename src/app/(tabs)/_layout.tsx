import { Tabs } from 'expo-router';
import { View, Pressable, Text } from 'react-native';
import { MotiView, MotiText, AnimatePresence } from 'moti';
import { SvgXml } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { useAuthContext } from 'src/auth/auth-context';
import { usesAdminShell } from 'src/auth/roles';
import { MessengerProvider } from 'src/components/messenger/messenger-provider';
import { InAppNotificationHost } from 'src/components/messenger/InAppNotificationHost';
import { SOLAR_ICONS } from 'src/components/ui/solar-registry';
import { spring } from 'src/theme/motion';

// Rose gradient — matches check-in hero card palette
const NAV_COLORS: [string, string, string] = ['#D86A88', '#C84D71', '#A83C5D'];

// Solar icons (bold-duotone when active, linear when idle) keyed into the registry.
type TabDef = { name: string; off?: string; on: string; label: string };

// Menu nhân viên (Staff/Manager): 5 tab, checkin là nút center nổi bật.
const STAFF_TABS: TabDef[] = [
  { name: 'schedule', off: 'tab-schedule-off', on: 'tab-schedule-on', label: 'Lịch làm' },
  { name: 'payroll', off: 'tab-payroll-off', on: 'tab-payroll-on', label: 'Lương' },
  { name: 'checkin', on: 'tab-checkin-on', label: 'Điểm danh' }, // center
  { name: 'chat', off: 'tab-chat-off', on: 'tab-chat-on', label: 'Chat' },
  { name: 'profile', off: 'tab-profile-off', on: 'tab-profile-on', label: 'Tôi' },
];

// Menu riêng cho Quản trị viên: Dashboard | Chat | Tôi (không có nút center).
// Mọi route vẫn được đăng ký trong navigator — chỉ NÚT trên tab bar đổi theo
// role; deep-link vào màn không thuộc menu vẫn hoạt động (Admin full quyền).
const ADMIN_TABS: TabDef[] = [
  { name: 'admin', off: 'tab-admin-off', on: 'tab-admin-on', label: 'Dashboard' },
  { name: 'features', off: 'tab-apps-off', on: 'tab-apps-on', label: 'Tiện ích' },
  { name: 'chat', off: 'tab-chat-off', on: 'tab-chat-on', label: 'Chat' },
  { name: 'profile', off: 'tab-profile-off', on: 'tab-profile-on', label: 'Tôi' },
];

const PILL_H = 72;

function TabIcon({ xmlKey, size, color }: { xmlKey?: string; size: number; color: string }) {
  const xml = xmlKey ? SOLAR_ICONS[xmlKey] : undefined;
  if (!xml) return null;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

function CiCiTabBar({ state, navigation, tabs }: { state: any; navigation: any; tabs: TabDef[] }) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);

  // Ẩn tab bar trên MỌI màn chi tiết bên trong 1 tab (route khác 'index') —
  // ví dụ chat/[id], payroll/[id]. Giữ tab bar trên 5 màn chính (index).
  const focusedTab = state.routes[state.index];
  const nested = focusedTab?.state;
  if (nested && typeof nested.index === 'number') {
    const activeName = nested.routes?.[nested.index]?.name;
    if (activeName && activeName !== 'index') return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' }}
    >
      <View style={{ marginHorizontal: 12, marginBottom: bottomPad }}>
        <LinearGradient
          colors={NAV_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            flexDirection: 'row',
            height: PILL_H,
            borderRadius: 24,
            paddingHorizontal: 6,
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.22)',
            shadowColor: '#C84D71',
            shadowOpacity: 0.5,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 6 },
            elevation: 18,
          }}
        >
          {tabs.map((tab) => {
            // Tra route theo TÊN (không theo index) — navigator đăng ký đủ mọi
            // screen nhưng menu chỉ hiển thị 1 tập con tuỳ role (Staff vs Admin).
            const route = state.routes.find((r: any) => r.name === tab.name);
            const isFocused = focusedTab?.name === tab.name;
            const isCenter = tab.name === 'checkin';

            function onPress() {
              if (!route) return;
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(tab.name);
              }
            }

            // ── Center tab — elevated brand face-scan button ──────────────
            if (isCenter) {
              return (
                <Pressable
                  key={tab.name}
                  onPress={onPress}
                  style={{ width: 66, alignItems: 'center', justifyContent: 'center', gap: 5 }}
                >
                  <MotiView
                    animate={{ scale: isFocused ? [1, 1.08, 1] : 1 }}
                    transition={{ type: 'timing', duration: 1800, loop: isFocused }}
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 18,
                      overflow: 'hidden',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: '#C84D71',
                      shadowOpacity: 0.6,
                      shadowRadius: 12,
                      elevation: 12,
                    }}
                  >
                    <LinearGradient
                      colors={['#FFE5EC', '#F48FB1', '#C84D71']}
                      style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <TabIcon xmlKey={tab.on} size={28} color="white" />
                      {/* tia scan */}
                      {isFocused && (
                        <MotiView
                          from={{ translateY: -25, opacity: 0.2 }}
                          animate={{ translateY: 25, opacity: 1 }}
                          transition={{ type: 'timing', duration: 1200, loop: true, repeatReverse: true }}
                          style={{
                            position: 'absolute',
                            width: 40,
                            height: 3,
                            borderRadius: 3,
                            backgroundColor: 'rgba(255,255,255,0.9)',
                            shadowColor: '#fff',
                            shadowOpacity: 1,
                            shadowRadius: 8,
                          }}
                        />
                      )}
                    </LinearGradient>
                    {/* vòng radar */}
                    {isFocused && (
                      <MotiView
                        from={{ scale: 1, opacity: 0.5 }}
                        animate={{ scale: 1.6, opacity: 0 }}
                        transition={{ type: 'timing', duration: 1500, loop: true }}
                        style={{
                          position: 'absolute',
                          width: 54,
                          height: 54,
                          borderRadius: 18,
                          borderWidth: 2,
                          borderColor: '#F8BBD0',
                        }}
                      />
                    )}
                  </MotiView>
                  <Text style={{ color: 'white', fontSize: 10, fontWeight: '700', letterSpacing: 0.1 }}>{tab.label}</Text>
                </Pressable>
              );
            }

            // ── Side tabs — floating pill that expands to icon+label on focus ──
            return (
              <MotiView
                key={tab.name}
                animate={{ flexGrow: isFocused ? 2.6 : 1 }}
                transition={{ type: 'spring', ...spring.soft }}
                style={{ flexBasis: 0, height: '100%', justifyContent: 'center' }}
              >
                <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <MotiView
                    animate={{
                      backgroundColor: isFocused ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0)',
                      paddingHorizontal: isFocused ? 14 : 0,
                    }}
                    transition={{ type: 'spring', ...spring.soft }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      height: 46,
                      borderRadius: 16,
                      gap: 7,
                      overflow: 'hidden',
                    }}
                  >
                    <TabIcon
                      xmlKey={isFocused ? tab.on : tab.off}
                      size={24}
                      color={isFocused ? 'white' : 'rgba(255,255,255,0.62)'}
                    />
                    <AnimatePresence>
                      {isFocused ? (
                        <MotiText
                          key="label"
                          from={{ opacity: 0, translateX: -6 }}
                          animate={{ opacity: 1, translateX: 0 }}
                          exit={{ opacity: 0, translateX: -6 }}
                          transition={{ type: 'timing', duration: 200 }}
                          numberOfLines={1}
                          style={{ color: 'white', fontSize: 13, fontWeight: '700', letterSpacing: 0.1 }}
                        >
                          {tab.label}
                        </MotiText>
                      ) : null}
                    </AnimatePresence>
                  </MotiView>
                </Pressable>
              </MotiView>
            );
          })}
        </LinearGradient>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { user } = useAuthContext();
  // Shell điều hướng CỐ ĐỊNH theo nhóm (không đẻ tab theo từng quyền):
  //   Admin thuần                     → Dashboard | Chat | Tôi (3 tab)
  //   Staff / Manager / Admin-kiêm-ca → 5 tab nhân viên
  // Tính năng quản lý/quản trị được đưa vào feature-grid ở màn home, không
  // thêm tab. Navigator đăng ký đủ screen; tab bar tra route theo tên.
  const tabs = usesAdminShell(user) ? ADMIN_TABS : STAFF_TABS;

  // Cổng chặn cấp app: chỉ Staff/Manager/Admin mới vào được dữ liệu hệ thống.
  return (
    <InternalAppGuard>
      <MessengerProvider>
        <Tabs
          screenOptions={{ headerShown: false }}
          tabBar={(props) => <CiCiTabBar {...props} tabs={tabs} />}
        >
          <Tabs.Screen name="schedule" />
          <Tabs.Screen name="payroll" />
          <Tabs.Screen name="checkin" />
          <Tabs.Screen name="chat" />
          <Tabs.Screen name="profile" />
          <Tabs.Screen name="admin" />
          <Tabs.Screen name="features" />
        </Tabs>
        <InAppNotificationHost />
      </MessengerProvider>
    </InternalAppGuard>
  );
}

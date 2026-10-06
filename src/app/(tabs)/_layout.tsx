import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { View, Pressable, Text, Keyboard, Platform } from 'react-native';
import { MotiView, MotiText, AnimatePresence } from 'moti';
import { SvgXml } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { useAuthContext } from 'src/auth/auth-context';
import { usesAdminShell } from 'src/auth/roles';
import { useT } from 'src/i18n';
import { useResponsive } from 'src/hooks/use-responsive';
import { StoreScopeGate } from 'src/features/branch/StoreScopeGate';
import { hidesTabBar } from 'src/features/pos/pos-layout';
import { MessengerProvider } from 'src/components/messenger/messenger-provider';
import { InAppNotificationHost } from 'src/components/messenger/InAppNotificationHost';
import { AssistantProvider } from 'src/components/assistant/assistant-provider';
import { SOLAR_ICONS } from 'src/components/ui/solar-registry';
import { spring } from 'src/theme/motion';
import { grey } from 'src/theme';
import { useBrandColor, withAlpha } from 'src/theme/brand-color';

// Thanh tab kiểu Minimal (như nav của bản web): nền trung tính (trắng / xám đậm), mục đang chọn tô nhạt
// theo màu cửa hàng + icon/nhãn màu cửa hàng; chỉ nút chấm công ở giữa (thao tác chính) dùng khối màu.
const SURFACE = { light: 'rgba(255,255,255,0.97)', dark: 'rgba(33,43,54,0.97)' }; // grey[800]
const BORDER = { light: 'rgba(145,158,171,0.20)', dark: 'rgba(255,255,255,0.08)' };

// Solar icons (bold-duotone when active, linear when idle) keyed into the registry.
type TabDef = { name: string; off?: string; on: string; labelKey: string; center?: boolean };

// Thanh tab kiểu MB Bank: Trang chủ | 2 tab việc chính | nút giữa nổi bật | Tiện ích. Tin nhắn, Trợ lý AI,
// Thông báo lên đầu trang chủ; avatar mở Tài khoản. Mọi route vẫn đăng ký trong navigator — chỉ NÚT trên
// thanh đổi theo vai trò; mở màn không thuộc menu (chat, trợ lý, tài khoản…) vẫn chạy, có nút quay lại.

// Nhân viên / Quản lý / Admin kiêm ca: nút giữa = chấm công.
const STAFF_TABS: TabDef[] = [
  { name: 'home', off: 'tab-home-off', on: 'tab-home-on', labelKey: 'tabs.home' },
  { name: 'schedule', off: 'tab-schedule-off', on: 'tab-schedule-on', labelKey: 'tabs.schedule' },
  { name: 'checkin', on: 'tab-checkin-on', labelKey: 'tabs.checkin', center: true },
  { name: 'payroll', off: 'tab-payroll-off', on: 'tab-payroll-on', labelKey: 'tabs.payroll' },
  { name: 'features', off: 'tab-apps-off', on: 'tab-apps-on', labelKey: 'tabs.features' },
];

// Chủ cửa hàng (Admin thuần): nút giữa = bán hàng.
const OWNER_TABS: TabDef[] = [
  { name: 'home', off: 'tab-home-off', on: 'tab-home-on', labelKey: 'tabs.home' },
  { name: 'products', off: 'tab-products-off', on: 'tab-products-on', labelKey: 'tabs.products' },
  { name: 'pos', on: 'tab-pos-on', labelKey: 'tabs.pos', center: true },
  { name: 'invoices', off: 'tab-invoices-off', on: 'tab-invoices-on', labelKey: 'tabs.invoices' },
  { name: 'features', off: 'tab-apps-off', on: 'tab-apps-on', labelKey: 'tabs.features' },
];

const PILL_H = 72;
// Cap + center the pill on tablet so it doesn't stretch full-bleed across a
// landscape iPad.
const TABLET_PILL_MAX_WIDTH = 560;

function TabIcon({ xmlKey, size, color }: { xmlKey?: string; size: number; color: string }) {
  const xml = xmlKey ? SOLAR_ICONS[xmlKey] : undefined;
  if (!xml) return null;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

function CiCiTabBar({ state, navigation, tabs }: { state: any; navigation: any; tabs: TabDef[] }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { isTablet, isLandscape } = useResponsive();
  const bottomPad = Math.max(insets.bottom, 8);
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const palette = useBrandColor((st) => st.palette);
  const activeColor = dark ? palette.dark : palette.main;
  const idleColor = dark ? grey[500] : grey[600];

  // Android (adjustResize): thanh tab nổi bị đẩy lên trên bàn phím và che ô nhập (Trợ lý, Chat…) — ẩn
  // khi bàn phím mở. iOS bàn phím phủ lên thanh tab nên không cần.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (keyboardUp) return null;

  // Ẩn tab bar trên MỌI màn chi tiết bên trong 1 tab (route khác 'index') —
  // ví dụ chat/[id], payroll/[id]. Giữ tab bar trên 5 màn chính (index).
  const focusedTab = state.routes[state.index];
  // Bán hàng trên tablet xoay ngang chia hai khung: thanh nổi giữa đáy sẽ đè lên cả hai → ẩn (màn đó có nút quay lại).
  if (hidesTabBar(focusedTab?.name, { isTablet, isLandscape })) return null;
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
      <View
        style={{
          marginHorizontal: 12,
          marginBottom: bottomPad,
          ...(isTablet
            ? { width: '100%' as const, maxWidth: TABLET_PILL_MAX_WIDTH, alignSelf: 'center' as const }
            : null),
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            height: PILL_H,
            borderRadius: 24,
            paddingHorizontal: 6,
            alignItems: 'center',
            backgroundColor: dark ? SURFACE.dark : SURFACE.light,
            borderWidth: 1,
            borderColor: dark ? BORDER.dark : BORDER.light,
            shadowColor: dark ? '#000000' : grey[500],
            shadowOpacity: dark ? 0.4 : 0.24,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          {tabs.map((tab) => {
            // Tra route theo TÊN (không theo index) — navigator đăng ký đủ mọi
            // screen nhưng menu chỉ hiển thị 1 tập con tuỳ role (Staff vs Admin).
            const route = state.routes.find((r: any) => r.name === tab.name);
            const isFocused = focusedTab?.name === tab.name;
            const isCenter = !!tab.center;
            // Tia quét + vòng radar chỉ hợp với chấm công khuôn mặt.
            const scanFx = isFocused && tab.name === 'checkin';

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
                    animate={{ scale: scanFx ? [1, 1.08, 1] : 1 }}
                    transition={{ type: 'timing', duration: 1800, loop: scanFx }}
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 18,
                      overflow: 'hidden',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: palette.main,
                      shadowOpacity: 0.35,
                      shadowRadius: 12,
                      elevation: 8,
                    }}
                  >
                    <LinearGradient
                      colors={[palette[400], palette.main, palette[700]]}
                      style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <TabIcon xmlKey={tab.on} size={28} color="white" />
                      {/* tia scan */}
                      {scanFx && (
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
                    {scanFx && (
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
                          borderColor: palette[200],
                        }}
                      />
                    )}
                  </MotiView>
                  <Text style={{ color: isFocused ? activeColor : idleColor, fontSize: 10, fontWeight: '700', letterSpacing: 0.1 }}>
                    {t(tab.labelKey)}
                  </Text>
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
                      backgroundColor: isFocused ? withAlpha(palette.main, dark ? 0.22 : 0.12) : withAlpha(palette.main, 0),
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
                      color={isFocused ? activeColor : idleColor}
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
                          style={{ color: activeColor, fontSize: 13, fontWeight: '700', letterSpacing: 0.1 }}
                        >
                          {t(tab.labelKey)}
                        </MotiText>
                      ) : null}
                    </AnimatePresence>
                  </MotiView>
                </Pressable>
              </MotiView>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { user } = useAuthContext();
  // Shell điều hướng CỐ ĐỊNH theo nhóm (không đẻ tab theo từng quyền):
  //   Admin thuần                     → chủ cửa hàng: Trang chủ | Hàng hoá | [Bán hàng] | Hoá đơn | Tiện ích
  //   Staff / Manager / Admin-kiêm-ca → nhân viên:    Trang chủ | Lịch làm | [Chấm công] | Lương | Tiện ích
  // Tính năng còn lại nằm ở Tiện ích (ghim tối đa 8 ra "Dùng nhanh" trang chủ). Navigator đăng ký đủ
  // screen; tab bar tra route theo tên.
  const tabs = usesAdminShell(user) ? OWNER_TABS : STAFF_TABS;

  // Cổng chặn cấp app: chỉ Staff/Manager/Admin mới vào được dữ liệu hệ thống. StoreScopeGate: nạp chi nhánh
  // đang làm việc + giỏ hàng của cửa hàng này từ máy trước khi dựng tab.
  return (
    <InternalAppGuard>
      <StoreScopeGate>
      <MessengerProvider>
        <AssistantProvider>
          <Tabs
            screenOptions={{ headerShown: false }}
            // Quay lại theo lịch sử tab: mở Tin nhắn từ trang chủ rồi bấm quay lại → về trang chủ.
            backBehavior="history"
            tabBar={(props) => <CiCiTabBar {...props} tabs={tabs} />}
          >
            <Tabs.Screen name="home" />
            <Tabs.Screen name="products" />
            <Tabs.Screen name="pos" />
            <Tabs.Screen name="invoices" />
            <Tabs.Screen name="schedule" />
            <Tabs.Screen name="payroll" />
            <Tabs.Screen name="checkin" />
            <Tabs.Screen name="chat" />
            <Tabs.Screen name="assistant" />
            <Tabs.Screen name="profile" />
            <Tabs.Screen name="admin" />
            <Tabs.Screen name="features" />
          </Tabs>
          <InAppNotificationHost />
        </AssistantProvider>
      </MessengerProvider>
      </StoreScopeGate>
    </InternalAppGuard>
  );
}

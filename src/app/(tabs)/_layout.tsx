import { Tabs, Redirect } from 'expo-router';
import { View, Pressable, Text } from 'react-native';
import { MotiView, MotiText } from 'moti';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthContext } from 'src/auth/auth-context';
import { MessengerProvider } from 'src/components/messenger/messenger-provider';
import { InAppNotificationHost } from 'src/components/messenger/InAppNotificationHost';
import { spring } from 'src/theme/motion';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// Rose gradient — matches check-in hero card palette
const NAV_COLORS: [string, string, string] = ['#D86A88', '#C84D71', '#A83C5D'];

const TABS: { name: string; icon: IconName; label: string }[] = [
  { name: 'schedule', icon: 'calendar-blank-outline', label: 'Lịch làm' },
  { name: 'payroll',  icon: 'wallet-outline',          label: 'Lương' },
  { name: 'checkin', icon: 'face-recognition',               label: 'Điểm danh' }, // index 2 = center
  { name: 'chat',     icon: 'message-outline',          label: 'Chat' },
  { name: 'profile',  icon: 'account-circle-outline',   label: 'Tôi' },
];

const PILL_H = 72;

function CiCiTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);

  // Ẩn tab bar khi đang ở màn chi tiết hội thoại (chat/[id]) để không che ô nhập tin nhắn.
  const focusedTab = state.routes[state.index];
  const nested = focusedTab?.state;
  const nestedRoute = nested?.routes?.[nested.index ?? (nested.routes?.length ?? 1) - 1];
  if (focusedTab?.name === 'chat' && nestedRoute?.name === '[id]') return null;

  return (
    // Normal-flow container so React Navigation auto-adds content padding.
    // Background matches darkest gradient stop — covers safe-area zone on all devices.
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
      }}
    >
      <View
        style={{
          marginHorizontal: 12,
          marginBottom: bottomPad,
        }}
      >
        <LinearGradient
          colors={NAV_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            flexDirection: 'row',
            height: PILL_H,
            borderRadius: 22,
            paddingHorizontal: 2,
            alignItems: 'center',
            // Subtle top highlight for glass feel
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.22)',
            shadowColor: '#C84D71',
            shadowOpacity: 0.5,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 6 },
            elevation: 18,
          }}
        >
          {TABS.map((tab, i) => {
            const route = state.routes[i];
            const isFocused = state.index === i;
            const isCenter = i === 2;

            function onPress() {
              if (!route) return;
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) navigation.navigate(tab.name);
            }

            // ── Center tab — white button on rose bg ──────────────────────
            if (isCenter) {
              return (
                <Pressable key={tab.name} onPress={onPress}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 4,
                  }}>
                  <MotiView
                    animate={{
                      scale: isFocused ? [1, 1.08, 1] : 1,
                    }}
                    transition={{
                      type: 'timing',
                      duration: 1800,
                      loop: isFocused,
                    }}
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
                      style={{
                        width: '100%',
                        height: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <MaterialCommunityIcons
                        name="face-recognition"
                        size={26}
                        color="white"
                      />

                      {/* tia scan */}
                      {isFocused && (
                        <MotiView
                          from={{
                            translateY: -25,
                            opacity: 0.2,
                          }}
                          animate={{
                            translateY: 25,
                            opacity: 1,
                          }}
                          transition={{
                            type: 'timing',
                            duration: 1200,
                            loop: true,
                            repeatReverse: true,
                          }}
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
                        from={{
                          scale: 1,
                          opacity: 0.5,
                        }}
                        animate={{
                          scale: 1.6,
                          opacity: 0,
                        }}
                        transition={{
                          type: 'timing',
                          duration: 1500,
                          loop: true,
                        }}
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
                  <Text style={{
                    color: 'white',
                    fontSize: 10, fontWeight: '700', letterSpacing: 0.1,
                  }}>{tab.label}</Text>
                </Pressable>
              );
            }

            // ── Regular tabs ──────────────────────────────────────────────
            return (
              <Pressable key={tab.name} onPress={onPress}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <MotiView
                  animate={{ scale: isFocused ? 1.04 : 1, translateY: isFocused ? -1 : 0 }}
                  transition={{ type: 'spring', ...spring.soft }}
                  style={{ padding: 5, borderRadius: 11, position: 'relative' }}
                >
                  {isFocused ? (
                    <View style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      borderRadius: 11,
                      backgroundColor: 'rgba(255,255,255,0.18)',
                    }} />
                  ) : null}
                  <MaterialCommunityIcons
                    name={tab.icon} size={22}
                    color={isFocused ? 'white' : 'rgba(255,255,255,0.55)'}
                  />
                </MotiView>
                <Text style={{
                  color: isFocused ? 'white' : 'rgba(255,255,255,0.55)',
                  fontSize: 10,
                  fontWeight: isFocused ? '600' : '400',
                  letterSpacing: 0.1,
                }}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </LinearGradient>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { authenticated } = useAuthContext();
  if (!authenticated) return <Redirect href="/(auth)/login" />;

  return (
    <MessengerProvider>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <CiCiTabBar {...props} />}
      >
        {/* Order must match TABS array: schedule(0) | payroll(1) | checkin(2) | chat(3) | profile(4) */}
        <Tabs.Screen name="schedule" />
        <Tabs.Screen name="payroll" />
        <Tabs.Screen name="checkin" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="profile" />
      </Tabs>
      <InAppNotificationHost />
    </MessengerProvider>
  );
}

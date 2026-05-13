import { Tabs, Redirect } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuthContext } from 'src/auth/auth-context';

function TabIcon({ name, color, size }: { name: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string; size: number }) {
  return <MaterialCommunityIcons name={name} color={color} size={size} />;
}

export default function TabsLayout() {
  const { authenticated } = useAuthContext();
  const theme = useTheme();

  if (!authenticated) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: '#637381',
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
          elevation: 8,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Tabs.Screen
        name="checkin"
        options={{
          title: 'Check-in',
          headerTitle: 'Điểm danh',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="fingerprint" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Lịch làm',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="calendar-clock" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="payroll"
        options={{
          title: 'Lương',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="cash-multiple" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="message-text-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

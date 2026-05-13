import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';

export default function ScheduleLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Lịch làm việc' }} />
      <Stack.Screen name="register" options={{ title: 'Đăng ký ca' }} />
    </Stack>
  );
}

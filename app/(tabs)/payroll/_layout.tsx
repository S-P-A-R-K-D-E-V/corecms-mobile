import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';

export default function PayrollLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Lịch lương' }} />
      <Stack.Screen name="[id]" options={{ title: 'Chi tiết kỳ lương' }} />
    </Stack>
  );
}

import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { useSignalR } from 'src/hooks/use-signalr';

export default function ChatLayout() {
  const theme = useTheme();
  // SignalR is initialized at layout level so it stays alive across chat screens
  useSignalR();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Tin nhắn' }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}

import { Redirect } from 'expo-router';
import { useAuthContext } from 'src/auth/auth-context';
import { ActivityIndicator, View } from 'react-native';
import { palette } from 'src/theme';

export default function Index() {
  const { loading, authenticated } = useAuthContext();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.background }}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return <Redirect href={authenticated ? '/(tabs)/checkin' : '/(auth)/login'} />;
}

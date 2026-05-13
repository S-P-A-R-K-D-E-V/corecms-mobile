import { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, TextInput, Button, HelperText, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';

import { useAuthContext } from 'src/auth/auth-context';

export default function VerifyOtpScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { verifyOtp, resendOtp } = useAuthContext();
  const theme = useTheme();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');

  async function handleVerify() {
    if (!otp || otp.length < 4) { setError('Vui lòng nhập mã OTP'); return; }
    setLoading(true); setError('');
    try {
      await verifyOtp(email, otp);
      router.replace('/(tabs)/checkin');
    } catch (err: any) {
      setError(err?.message || 'Mã OTP không hợp lệ');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      await resendOtp(email);
      Alert.alert('Thành công', 'Đã gửi lại mã OTP');
    } catch {
      Alert.alert('Lỗi', 'Gửi lại thất bại');
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.inner}>
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginBottom: 8 }}>Xác thực OTP</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 32 }}>
          Nhập mã OTP đã gửi đến {email}
        </Text>
        <TextInput
          label="Mã OTP"
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          mode="outlined"
          left={<TextInput.Icon icon="shield-key-outline" />}
          style={styles.input}
        />
        <HelperText type="error" visible={!!error}>{error}</HelperText>
        <Button mode="contained" onPress={handleVerify} loading={loading} disabled={loading} style={styles.button} contentStyle={{ paddingVertical: 6 }}>
          Xác nhận
        </Button>
        <Button mode="text" onPress={handleResend} loading={resending} disabled={resending} style={{ marginTop: 8 }}>
          Gửi lại mã
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  input: { backgroundColor: 'transparent' },
  button: { marginTop: 12, borderRadius: 12 },
});

import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { Screen } from 'src/components/shared';
import { AppHeader } from 'src/components/shared';
import { Text, Button, TextField, Pressable } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';

export function VerifyOtpScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { verifyOtp, resendOtp } = useAuthContext();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');

  async function handleVerify() {
    if (!otp || otp.length < 4) {
      setError('Vui lòng nhập mã OTP');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await verifyOtp(email!, otp);
      // Về boot gate (/) — index.tsx chọn màn "nhà" theo role (Admin → dashboard).
      router.replace('/');
    } catch (err: any) {
      setError(extractApiError(err) || 'Mã OTP không hợp lệ');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      await resendOtp(email!);
      toast.success('Đã gửi lại mã OTP');
    } catch {
      toast.error('Gửi lại thất bại');
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen tabBarInset={false}>
      <AppHeader title={t('auth.otpTitle')} back />
      <View className="flex-1 justify-center gap-4">
        <Text tone="muted">{t('auth.otpSubtitle', { email: email ?? '' })}</Text>
        <TextField
          label={t('auth.otpCode')}
          value={otp}
          onChangeText={(v) => { setOtp(v); setError(''); }}
          keyboardType="number-pad"
          maxLength={6}
          icon="shield-key-outline"
          error={error || undefined}
        />
        <Button loading={loading} onPress={handleVerify}>{t('auth.verify')}</Button>
        <Pressable onPress={handleResend} className="self-center py-2" disabled={resending}>
          <Text tone="primary" className="font-semibold">{t('auth.resend')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

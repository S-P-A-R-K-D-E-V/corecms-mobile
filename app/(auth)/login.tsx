import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, TextInput, Button, HelperText, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useAuthContext } from 'src/auth/auth-context';

export default function LoginScreen() {
  const { login } = useAuthContext();
  const theme = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate() {
    const e: typeof errors = {};
    if (!email) e.email = 'Vui lòng nhập email';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Email không hợp lệ';
    if (!password) e.password = 'Vui lòng nhập mật khẩu';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleLogin() {
    if (!validate()) return;
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)/checkin');
    } catch (err: any) {
      if (err?.message === 'OTP_REQUIRED') {
        router.push({ pathname: '/(auth)/verify-otp', params: { email } });
      } else {
        Alert.alert('Đăng nhập thất bại', err?.message || 'Email hoặc mật khẩu không đúng');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.inner}>
        <View style={styles.header}>
          <View style={[styles.logoCircle, { backgroundColor: theme.colors.primary }]}>
            <Text variant="headlineMedium" style={{ color: '#fff', fontWeight: 'bold' }}>C</Text>
          </View>
          <Text variant="headlineSmall" style={[styles.brand, { color: theme.colors.primary }]}>
            CoreCMS
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            Đăng nhập để tiếp tục
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            left={<TextInput.Icon icon="email-outline" />}
            error={!!errors.email}
            style={styles.input}
            mode="outlined"
          />
          <HelperText type="error" visible={!!errors.email}>{errors.email}</HelperText>

          <TextInput
            label="Mật khẩu"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="password"
            left={<TextInput.Icon icon="lock-outline" />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
            error={!!errors.password}
            style={styles.input}
            mode="outlined"
          />
          <HelperText type="error" visible={!!errors.password}>{errors.password}</HelperText>

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.button}
            contentStyle={{ paddingVertical: 6 }}
            labelStyle={{ fontSize: 16 }}
          >
            Đăng nhập
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 4,
  },
  brand: { fontWeight: 'bold' },
  form: { gap: 4 },
  input: { backgroundColor: 'transparent' },
  button: { marginTop: 16, borderRadius: 12 },
});

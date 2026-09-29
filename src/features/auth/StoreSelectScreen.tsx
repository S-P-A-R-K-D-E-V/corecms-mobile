import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Text, Button, Card, TextField } from 'src/components/ui';
import { queryClient } from 'src/services/query/client';
import { APP_DISPLAY_NAME, SAAS_ZONE, lookupStore, setStoreCode } from 'src/services/store-config';

// ----------------------------------------------------------------------
// Bản app cửa hàng: người dùng nhập mã cửa hàng (phần trước .devbyspark.com). App kiểm tra cửa
// hàng có thật rồi mới lưu; từ đó mọi API đi tới https://<mã>.devbyspark.com.
// ----------------------------------------------------------------------

const REASON_TEXT = {
  invalid: 'Mã cửa hàng gồm 3–32 chữ thường, số hoặc dấu gạch ngang.',
  not_found: 'Không tìm thấy cửa hàng với mã này.',
  suspended: 'Cửa hàng này đang tạm khoá. Vui lòng liên hệ chủ cửa hàng.',
  network: 'Không kết nối được. Kiểm tra mạng và thử lại.',
} as const;

export function StoreSelectScreen() {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    setError(undefined);
    setLoading(true);
    try {
      const result = await lookupStore(code);
      if (!result.ok) {
        setError(REASON_TEXT[result.reason]);
        return;
      }
      await setStoreCode(result.code);
      queryClient.clear();
      router.replace('/(auth)/login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-bg dark:bg-bg-dark"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View pointerEvents="none" className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/15" />

      <View className="flex-1 justify-center px-7 gap-8">
        <View className="items-center gap-1">
          <Text variant="title" className="text-2xl">{APP_DISPLAY_NAME}</Text>
          <Text tone="muted" className="text-center">Nhập mã cửa hàng để bắt đầu</Text>
        </View>

        <Card className="p-6 gap-4">
          <TextField
            label="Mã cửa hàng"
            placeholder="vd: tiemtocabc"
            value={code}
            onChangeText={(v) => {
              setCode(v);
              setError(undefined);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleContinue}
            error={error}
            icon="store-outline"
          />
          <Text variant="caption" tone="faint">
            Mã là phần đầu địa chỉ web của cửa hàng, ví dụ tiemtocabc trong tiemtocabc.{SAAS_ZONE}. Hỏi quản lý cửa
            hàng nếu bạn chưa có.
          </Text>
          <Button size="lg" loading={loading} disabled={!code.trim()} onPress={handleContinue}>
            Tiếp tục
          </Button>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}

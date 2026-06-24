import { View, Animated } from 'react-native';
import { useEffect, useRef } from 'react';

import { Screen, AppHeader } from 'src/components/shared';
import { Text, Button, Icon, BrandGradient, type IconName } from 'src/components/ui';
import { useGpsGate } from 'src/hooks/use-gps-gate';

// ----------------------------------------------------------------------
// Cổng GPS cho Kiểm tiền quầy — đồng bộ check-in: bắt buộc xác định vị trí
// trước khi vào màn, lỗi thì đếm ngược rồi cho qua (fallback mềm).
// ----------------------------------------------------------------------

export function ShiftCashGpsGate({ children }: { children: React.ReactNode }) {
  // Chặn cứng: bắt buộc có GPS mới vào được Kiểm tiền quầy (không fallback).
  const gps = useGpsGate({ hardBlock: true });

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.35, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  if (gps.allowed) return <>{children}</>;

  const isError = gps.status === 'error';
  const icon: IconName = isError ? 'map-marker-alert' : 'map-marker-radius';

  return (
    <Screen tabBarInset={false} edges={['top', 'bottom']}>
      <AppHeader title="Kiểm tiền quầy" back />
      <View className="flex-1 items-center justify-center px-6 gap-5">
        <BrandGradient className="rounded-full" variant="brand" style={{ backgroundColor: 'transparent' }}>
          <Animated.View style={{ transform: [{ scale: pulse }] }} className="w-28 h-28 items-center justify-center">
            <Icon name={icon} size={52} color="#FFFFFF" />
          </Animated.View>
        </BrandGradient>

        <View className="items-center gap-1.5">
          <Text variant="title2" className="text-center">
            {isError ? 'Cần quyền vị trí (GPS)' : 'Đang xác định vị trí…'}
          </Text>
          <Text tone="muted" className="text-center leading-5">
            {isError
              ? 'Kiểm tiền quầy bắt buộc xác nhận bạn đang ở quầy. Vui lòng bật định vị và cấp quyền vị trí, sau đó thử lại.'
              : 'Tính năng Kiểm tiền quầy cần xác nhận bạn đang ở quầy, tương tự check-in.'}
          </Text>
        </View>

        {isError ? (
          <Button variant="outline" icon="refresh" fullWidth={false} onPress={() => gps.retry()}>
            Thử lại
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}

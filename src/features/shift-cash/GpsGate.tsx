import { View, Animated } from 'react-native';
import { createContext, useContext, useEffect, useRef } from 'react';

import { Screen, AppHeader } from 'src/components/shared';
import { Text, Button, Icon, BrandGradient, type IconName } from 'src/components/ui';
import { useGpsGate, type Coords } from 'src/hooks/use-gps-gate';
import { formatDistance } from 'src/services/geo';

// Toạ độ đã xác minh ở cổng GPS — màn con đọc để gửi kèm thao tác (ghi audit).
const ShiftCashGpsContext = createContext<Coords | null>(null);
export const useShiftCashGps = () => useContext(ShiftCashGpsContext);

// ----------------------------------------------------------------------
// Cổng GPS cho Kiểm tiền quầy — đồng bộ check-in: bắt buộc xác định vị trí
// trước khi vào màn, lỗi thì đếm ngược rồi cho qua (fallback mềm).
// ----------------------------------------------------------------------

export function ShiftCashGpsGate({ children }: { children: React.ReactNode }) {
  // Chặn cứng + bắt buộc đang trong khu vực cửa hàng (geofence) mới vào được.
  const gps = useGpsGate({ hardBlock: true, requireGeofence: true });

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

  if (gps.allowed) {
    return <ShiftCashGpsContext.Provider value={gps.coords}>{children}</ShiftCashGpsContext.Provider>;
  }

  const isError = gps.status === 'error';
  // GPS lấy được nhưng đang ở ngoài bán kính cửa hàng.
  const isOutside = gps.status === 'ready' && !gps.within;
  const showRetry = isError || isOutside;
  const icon: IconName = isError ? 'map-marker-alert' : isOutside ? 'map-marker-off' : 'map-marker-radius';

  const title = isError
    ? 'Cần quyền vị trí (GPS)'
    : isOutside
      ? 'Bạn đang ở ngoài cửa hàng'
      : 'Đang xác định vị trí…';

  const message = isError
    ? 'Kiểm tiền quầy bắt buộc xác nhận bạn đang ở quầy. Vui lòng bật định vị và cấp quyền vị trí, sau đó thử lại.'
    : isOutside
      ? gps.nearest
        ? `Bạn cách ${gps.nearest.branch.branchName} khoảng ${formatDistance(gps.nearest.distance)} (cho phép trong ${gps.nearest.radius}m). Hãy đến quầy rồi thử lại.`
        : 'Bạn đang ở ngoài khu vực cửa hàng. Hãy đến quầy rồi thử lại.'
      : 'Tính năng Kiểm tiền quầy cần xác nhận bạn đang ở quầy, tương tự check-in.';

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
          <Text variant="title2" className="text-center">{title}</Text>
          <Text tone="muted" className="text-center leading-5">{message}</Text>
        </View>

        {showRetry ? (
          <Button variant="outline" icon="refresh" fullWidth={false} onPress={() => gps.retry()}>
            Thử lại
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}

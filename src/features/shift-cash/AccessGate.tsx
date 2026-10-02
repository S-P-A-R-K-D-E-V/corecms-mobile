import { View, Animated, AppState, Linking } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Screen, AppHeader } from 'src/components/shared';
import { Text, Button, Icon, BrandGradient, type IconName } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { bypassesShiftCashGate } from 'src/auth/roles';
import { getMySchedule } from 'src/api/schedule';
import { useGpsGate, type Coords } from 'src/hooks/use-gps-gate';
import { formatDistance } from 'src/services/geo';
import { haptics } from 'src/services/haptics';
import { useT } from 'src/i18n';

import {
  SHIFT_CASH_MAX_ACCURACY_M,
  decideShiftCashAccess,
  getShiftCashDenial,
  shiftCashDenialMessage,
  shiftCashDenialTitle,
  shiftCheckFrom,
  type ShiftCashDecision,
  type ShiftCashDenial,
} from './access';
import { vnToday } from './utils';

// ----------------------------------------------------------------------
// Cổng vào Kiểm tiền quầy. Admin vào thẳng. Staff & Manager: có ca hôm nay (ngày VN) → đang ở cửa hàng
// (GPS) → mới vào màn, và chỉ làm việc với ngày hôm nay. Toạ độ đã xác minh được màn con gửi kèm mọi
// lệnh (header X-Geo-* + body audit). BE trả 403 ShiftCash.* → quay về cổng, hiện lý do + nút thử lại.
// ----------------------------------------------------------------------

export type ShiftCashAccess = {
  /** Toạ độ đã xác minh ở cổng — null với Admin (vào thẳng, không lấy GPS). */
  geo: Coords | null;
  /** Chỉ được xem/làm ngày hôm nay (mọi người trừ Admin). */
  todayOnly: boolean;
  /** Lỗi 403 ShiftCash.* từ BE → đưa về cổng hiện lý do. Trả true nếu đã xử lý (màn con khỏi báo lỗi). */
  handleDenied: (err: unknown) => boolean;
};

const ADMIN_ACCESS: ShiftCashAccess = { geo: null, todayOnly: false, handleDenied: () => false };

const ShiftCashAccessContext = createContext<ShiftCashAccess>({ geo: null, todayOnly: true, handleDenied: () => false });
export const useShiftCashAccess = () => useContext(ShiftCashAccessContext);

export function ShiftCashAccessGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext();
  if (bypassesShiftCashGate(user)) {
    return <ShiftCashAccessContext.Provider value={ADMIN_ACCESS}>{children}</ShiftCashAccessContext.Provider>;
  }
  return <StaffAccessGate>{children}</StaffAccessGate>;
}

function StaffAccessGate({ children }: { children: React.ReactNode }) {
  const t = useT();
  const qc = useQueryClient();

  // 1) Ca hôm nay — khoá 'shift-cash' để nút làm mới của màn kiểm quầy kiểm tra lại luôn.
  const today = vnToday();
  const shiftQ = useQuery({
    queryKey: ['shift-cash', 'my-shift', today],
    queryFn: () => getMySchedule(today, today),
  });
  const shift = shiftCheckFrom(shiftQ, today);

  // 2) GPS — chỉ bắt đầu khi đã có ca (người không có ca không bị hỏi quyền vị trí).
  const gps = useGpsGate({
    hardBlock: true,
    requireGeofence: true,
    maxAccuracy: SHIFT_CASH_MAX_ACCURACY_M,
    rejectMocked: true,
    enabled: shift === 'ok',
  });

  // 3) BE từ chối (403 ShiftCash.*) → chặn tới khi người dùng bấm thử lại.
  const [denial, setDenial] = useState<ShiftCashDenial | null>(null);

  const decision = decideShiftCashAccess({ bypass: false, serverDenied: denial != null, shift, gps });

  const handleDenied = useCallback((err: unknown) => {
    const d = getShiftCashDenial(err);
    if (!d) return false;
    haptics.error();
    setDenial(d);
    return true;
  }, []);

  const retry = () => {
    setDenial(null);
    // Bỏ số liệu/lỗi cũ của màn kiểm quầy để vào lại thì tải mới (không bật lại lỗi 403 cũ).
    qc.removeQueries({ predicate: (q) => q.queryKey[0] === 'shift-cash' && q.queryKey[1] !== 'my-shift' });
    shiftQ.refetch();
    // GPS chưa bắt đầu (đang chờ ca) thì tự chạy khi có ca; đã chạy rồi thì lấy lại từ đầu.
    if (gps.status !== 'idle') gps.retry();
  };

  // Quay lại app (từ nền) → kiểm tra lại ca + lấy lại vị trí ngầm; ra khỏi cửa hàng thì bị chặn lại.
  // Đang chặn vì quyền/GPS tắt mà vừa bật trong Cài đặt (nút "Mở Cài đặt") → tự kiểm tra lại, khỏi bấm thử lại.
  const latest = useRef({ refetch: shiftQ.refetch, revalidate: gps.revalidate });
  latest.current = { refetch: shiftQ.refetch, revalidate: gps.revalidate };
  useEffect(() => {
    let prev = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && prev === 'background') {
        latest.current.refetch();
        latest.current.revalidate();
      }
      prev = next;
    });
    return () => sub.remove();
  }, []);

  const access = useMemo<ShiftCashAccess>(
    () => ({ geo: gps.coords, todayOnly: true, handleDenied }),
    [gps.coords, handleDenied]
  );

  if (decision.state === 'allow') {
    return <ShiftCashAccessContext.Provider value={access}>{children}</ShiftCashAccessContext.Provider>;
  }

  const view = gateView(decision, { t, denial, gps });
  const retrying = shiftQ.isFetching || gps.status === 'loading';

  return (
    <GateScreen
      title={t('shiftCash.title')}
      icon={view.icon}
      heading={view.heading}
      message={view.message}
      checking={decision.state === 'checking'}
    >
      {decision.state === 'blocked' ? (
        <View className="items-center gap-2">
          <Button variant="outline" icon="refresh" fullWidth={false} loading={retrying} onPress={retry}>
            {t('common.retry')}
          </Button>
          {decision.reason === 'permission' ? (
            <Button variant="ghost" icon="cog-outline" fullWidth={false} onPress={() => Linking.openSettings()}>
              {t('shiftCash.gate.openSettings')}
            </Button>
          ) : null}
        </View>
      ) : null}
    </GateScreen>
  );
}

type GateView = { icon: IconName; heading: string; message: string };

function gateView(
  decision: Exclude<ShiftCashDecision, { state: 'allow' }>,
  { t, denial, gps }: { t: ReturnType<typeof useT>; denial: ShiftCashDenial | null; gps: ReturnType<typeof useGpsGate> }
): GateView {
  if (decision.state === 'checking') {
    return decision.step === 'shift'
      ? { icon: 'calendar-clock', heading: t('shiftCash.gate.checkingShift'), message: t('shiftCash.gate.checkingShiftMsg') }
      : { icon: 'map-marker-radius', heading: t('shiftCash.gate.locating'), message: t('shiftCash.gate.locatingMsg') };
  }
  switch (decision.reason) {
    case 'server':
      return {
        icon: 'shield-alert-outline',
        heading: denial ? shiftCashDenialTitle(denial) : t('shiftCash.gate.deniedTitle'),
        message: denial ? shiftCashDenialMessage(denial) : t('shiftCash.gate.deniedMsg'),
      };
    case 'no_shift':
      return { icon: 'calendar-remove', heading: t('shiftCash.gate.noShiftTitle'), message: t('shiftCash.gate.noShiftMsg') };
    case 'shift_error':
      return { icon: 'calendar-alert', heading: t('shiftCash.gate.shiftErrorTitle'), message: t('shiftCash.gate.shiftErrorMsg') };
    case 'permission':
      return { icon: 'map-marker-alert', heading: t('shiftCash.gate.permissionTitle'), message: t('shiftCash.gate.permissionMsg') };
    case 'unavailable':
      return { icon: 'crosshairs-off', heading: t('shiftCash.gate.unavailableTitle'), message: t('shiftCash.gate.unavailableMsg') };
    case 'branches_error':
      return { icon: 'store-alert-outline', heading: t('shiftCash.gate.branchesErrorTitle'), message: t('shiftCash.gate.branchesErrorMsg') };
    case 'low_accuracy':
      return {
        icon: 'crosshairs-question',
        heading: t('shiftCash.gate.lowAccuracyTitle'),
        message: t('shiftCash.gate.lowAccuracyMsg', {
          accuracy: formatDistance(gps.coords?.accuracy ?? 0),
          max: SHIFT_CASH_MAX_ACCURACY_M,
        }),
      };
    case 'mocked':
      return { icon: 'map-marker-off', heading: t('shiftCash.gate.mockedTitle'), message: t('shiftCash.gate.mockedMsg') };
    case 'outside':
    default:
      return {
        icon: 'map-marker-off',
        heading: t('shiftCash.gate.outsideTitle'),
        message: gps.nearest
          ? t('shiftCash.gate.outsideNear', {
              branch: gps.nearest.branch.branchName,
              distance: formatDistance(gps.nearest.distance),
              radius: gps.nearest.radius,
            })
          : t('shiftCash.gate.outsideMsg'),
      };
  }
}

function GateScreen({
  title,
  icon,
  heading,
  message,
  checking,
  children,
}: {
  title: string;
  icon: IconName;
  heading: string;
  message: string;
  checking: boolean;
  children?: React.ReactNode;
}) {
  // Nhịp "đang kiểm tra" — đứng yên khi đã bị chặn.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!checking) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.35, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, checking]);

  return (
    <Screen tabBarInset={false} edges={['top', 'bottom']}>
      <AppHeader title={title} back />
      <View className="flex-1 items-center justify-center px-6 gap-5">
        <BrandGradient className="rounded-full" variant="brand" style={{ backgroundColor: 'transparent' }}>
          <Animated.View style={{ width: 112, height: 112, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pulse }] }}>
            <Icon name={icon} size={52} color="#FFFFFF" />
          </Animated.View>
        </BrandGradient>

        <View className="items-center gap-1.5">
          <Text variant="title2" className="text-center">{heading}</Text>
          <Text tone="muted" className="text-center leading-5">{message}</Text>
        </View>

        {children}
      </View>
    </Screen>
  );
}

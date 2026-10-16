import { createContext, isValidElement, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Dimensions, Platform, RefreshControl, View, type FlatListProps, type LayoutChangeEvent, type RefreshControlProps, type ScrollViewProps } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  runOnJS,
  runOnUI,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { cssInterop, useColorScheme } from 'nativewind';

import { Text } from '../ui/text';
import { MascotGlow, MascotRings, MascotShadow, MascotSpeedLines, SparkMascot, MASCOT_ASPECT, type MascotMood } from '../ui/spark-mascot';
import { haptics } from 'src/services/haptics';
import { t, useT } from 'src/i18n';

// ----------------------------------------------------------------------
// Kéo để làm mới kiểu Spark: header của màn đứng yên (nằm ngoài vùng cuộn), nội dung tách xuống, khe hở ở giữa có
// linh vật tia chớp đổi trạng thái: kéo (nhìn xuống) → đủ ngưỡng (nheo mắt, rung nhẹ) → đang tải (nảy) → tải lâu
// (quay) → xong (phát sáng, "Đã cập nhật · giờ") / lỗi (xám). Chỉ hiện khi người dùng tự kéo — tải nền không hiện.
//   - iOS: giữ RefreshControl gốc nhưng trong suốt — UIKit lo vật lý kéo/giữ chỗ; linh vật vẽ phía sau theo độ kéo.
//   - Android: không có kéo quá đầu → bắt cử chỉ khi danh sách đang ở đầu, tự dịch nội dung xuống.
// Bản v1 chỉ JS (đẩy OTA được). Bản build native sau thay lớp cử chỉ bằng gesture-handler + rung Taptic trên iOS.
// ----------------------------------------------------------------------

// className / contentContainerClassName chỉ được NativeWind đổi thành style trên thành phần đã đăng ký — vùng cuộn của
// Reanimated chưa có sẵn, đăng ký ở đây (không có thì p-4 / gap-3.5 của Screen mất hết).
cssInterop(Animated.ScrollView, { className: 'style', contentContainerClassName: 'contentContainerStyle' });
cssInterop(Animated.FlatList, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
  columnWrapperClassName: 'columnWrapperStyle',
});

export const PULL_THRESHOLD = 72;
/** Chiều cao khe lúc đang tải (Android). iOS do UIRefreshControl giữ ~60. */
const HOLD = 64;
const MIN_SHOW_MS = 700;
const SLOW_MS = 2000;
const SLOW_NOTE_MS = 4500;
const TIMEOUT_MS = 15000;
const DONE_MS = 650;
const ERROR_MS = 1600;
const CLOSE_MS = 300;
const MASCOT_W = 34;

export type RefreshPhase = 'rest' | 'pull' | 'armed' | 'loading' | 'slow' | 'done' | 'error';
const BUSY: RefreshPhase[] = ['loading', 'slow', 'done', 'error'];

/** Kết quả làm mới báo lỗi: kết quả refetch của react-query (isError / status 'error'), hoặc mảng có cái lỗi. */
export function isFailedRefresh(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(isFailedRefresh);
  if (!value || typeof value !== 'object') return false;
  const v = value as { isError?: unknown; status?: unknown };
  return v.isError === true || v.status === 'error';
}

/** Giờ:phút cho dòng "Đã cập nhật · 21:55". */
function clock(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Máy trạng thái làm mới (không có giao diện). `onRefresh` trả Promise → chờ Promise (reject hoặc kết quả lỗi = lỗi);
 * không trả Promise → theo cờ `refreshing` của màn (bật rồi tắt = xong; không bật trong 1,2 giây = coi như xong).
 * Luôn hiện tối thiểu 0,7 giây, quá 15 giây = lỗi. `close` đóng khe (do nơi dùng làm hoạt ảnh).
 */
export function useRefreshMachine({ onRefresh, refreshing, close }: { onRefresh?: () => unknown; refreshing?: boolean; close: () => void }) {
  const [phase, setPhaseState] = useState<RefreshPhase>('rest');
  const [slowNote, setSlowNote] = useState(false);
  const [doneAt, setDoneAt] = useState(0);
  const phaseRef = useRef<RefreshPhase>('rest');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const session = useRef({ id: 0, settled: true, startedAt: 0, waitFlag: 'no' as 'no' | 'waiting' | 'seen' });
  const closeRef = useRef(close);
  closeRef.current = close;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const setPhase = useCallback((p: RefreshPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clear, [clear]);

  const finish = useCallback(
    (ok: boolean, id: number) => {
      const s = session.current;
      if (id !== s.id || s.settled) return;
      s.settled = true;
      s.waitFlag = 'no';
      clear();
      later(Math.max(0, MIN_SHOW_MS - (Date.now() - s.startedAt)), () => {
        setPhase(ok ? 'done' : 'error');
        setDoneAt(Date.now());
        AccessibilityInfo.announceForAccessibility(ok ? t('refresh.done', { time: clock(Date.now()) }) : t('refresh.error'));
        later(ok ? DONE_MS : ERROR_MS, () => {
          closeRef.current();
          later(CLOSE_MS, () => {
            setPhase('rest');
            setSlowNote(false);
          });
        });
      });
    },
    [clear, later, setPhase]
  );

  /** Người dùng kéo đủ ngưỡng và thả (Android) / UIKit báo làm mới (iOS). Trả false nếu đang bận. */
  const start = useCallback(() => {
    if (BUSY.includes(phaseRef.current)) return false;
    clear();
    const s = session.current;
    s.id += 1;
    s.settled = false;
    s.startedAt = Date.now();
    s.waitFlag = 'no';
    const id = s.id;
    setPhase('loading');
    setSlowNote(false);
    AccessibilityInfo.announceForAccessibility(t('refresh.loading'));
    later(SLOW_MS, () => {
      if (phaseRef.current === 'loading') setPhase('slow');
    });
    later(SLOW_NOTE_MS, () => setSlowNote(true));
    later(TIMEOUT_MS, () => finish(false, id));
    let result: unknown;
    try {
      result = onRefreshRef.current?.();
    } catch {
      finish(false, id);
      return true;
    }
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).then(
        (v) => finish(!isFailedRefresh(v), id),
        () => finish(false, id)
      );
    } else {
      s.waitFlag = 'waiting';
      later(1200, () => {
        if (session.current.id === id && session.current.waitFlag === 'waiting') finish(true, id);
      });
    }
    return true;
  }, [clear, finish, later, setPhase]);

  // Màn không trả Promise: theo cờ refreshing (bật → tắt = xong).
  useEffect(() => {
    const s = session.current;
    if (s.settled || s.waitFlag === 'no') return;
    if (refreshing) s.waitFlag = 'seen';
    else if (s.waitFlag === 'seen') finish(true, s.id);
  }, [refreshing, finish]);

  /** Trạng thái lúc đang kéo (chưa thả) — bỏ qua khi đang bận. */
  const setDrag = useCallback(
    (p: 'rest' | 'pull' | 'armed') => {
      const cur = phaseRef.current;
      if (BUSY.includes(cur) || cur === p) return;
      if (p === 'armed') haptics.light();
      setPhase(p);
    },
    [setPhase]
  );

  return { phase, slowNote, doneAt, start, setDrag, busy: BUSY.includes(phase) };
}

// ── Khe hở + linh vật ────────────────────────────────────────────────

const PullContext = createContext<SharedValue<number> | null>(null);

/** Độ tách hiện tại (px) của vùng nội dung — để khối đầu nội dung bo góc khi tách khỏi header. null ngoài PullRefresh. */
export function usePullDistance() {
  return useContext(PullContext);
}

function moodOf(phase: RefreshPhase, reduce: boolean): MascotMood {
  switch (phase) {
    case 'pull':
      return 'look';
    case 'armed':
    case 'done':
      return 'blink';
    case 'slow':
      return reduce ? 'idle' : 'spin';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

function RefreshIndicator({
  pull,
  phase,
  slowNote,
  doneAt,
  anchor,
}: {
  pull: SharedValue<number>;
  phase: RefreshPhase;
  slowNote: boolean;
  doneAt: number;
  /** 'top': nằm sau vùng cuộn, mép trên (iOS). 'bottom': nằm trong vùng kéo phía trên nội dung, sát mép dưới (Android). */
  anchor: 'top' | 'bottom';
}) {
  const tr = useT();
  const reduce = useReducedMotion();
  const { colorScheme } = useColorScheme();
  const busy = BUSY.includes(phase);
  const bob = useSharedValue(0);
  const spin = useSharedValue(0);
  const pulse = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(bob);
    cancelAnimation(spin);
    cancelAnimation(pulse);
    bob.value = 0;
    spin.value = 0;
    pulse.value = 1;
    if (reduce && (phase === 'loading' || phase === 'slow')) {
      pulse.value = withRepeat(withTiming(0.45, { duration: 550, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else if (phase === 'loading') {
      bob.value = withRepeat(withTiming(1, { duration: 310, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else if (phase === 'slow') {
      spin.value = withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1, false);
    }
    glow.value = phase === 'done' ? withSpring(1, { damping: 9, stiffness: 160 }) : 0;
  }, [phase, reduce, bob, spin, pulse, glow]);

  const busyFlag = busy ? 1 : 0;
  const gapStyle = useAnimatedStyle(() => ({ height: pull.value }));
  const mascotStyle = useAnimatedStyle(() => {
    const p = pull.value;
    const dragScale = interpolate(p, [0, PULL_THRESHOLD], [0.45, 1], Extrapolation.CLAMP);
    const dragOpacity = interpolate(p, [0, 36], [0, 1], Extrapolation.CLAMP);
    const dragRotate = interpolate(p, [0, PULL_THRESHOLD], [-16, 0], Extrapolation.CLAMP);
    const b = bob.value;
    return {
      opacity: busyFlag ? pulse.value : dragOpacity,
      transform: [
        { perspective: 300 },
        { translateY: -11 * b },
        { scale: busyFlag ? 1 : dragScale },
        { scaleX: 1.06 - 0.09 * b },
        { scaleY: 0.94 + 0.08 * b },
        { rotate: `${busyFlag ? 0 : dragRotate}deg` },
        { rotateY: `${spin.value}deg` },
      ],
    };
  });
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: (busyFlag ? 1 : interpolate(pull.value, [0, PULL_THRESHOLD], [0, 1], Extrapolation.CLAMP)) * (1 - 0.45 * bob.value),
    transform: [{ scale: 1 - 0.38 * bob.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.4 + 0.6 * glow.value }] }));
  const captionStyle = useAnimatedStyle(() => ({
    opacity: busyFlag ? 1 : interpolate(pull.value, [48, 64], [0, 1], Extrapolation.CLAMP),
  }));

  let caption = '';
  if (phase === 'pull') caption = tr('refresh.pull');
  else if (phase === 'armed') caption = tr('refresh.release');
  else if (phase === 'loading' || phase === 'slow') caption = slowNote ? tr('refresh.slow') : tr('refresh.loading');
  else if (phase === 'done') caption = tr('refresh.done', { time: clock(doneAt) });
  else if (phase === 'error') caption = tr('refresh.error');

  const mascotH = MASCOT_W * MASCOT_ASPECT;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          ...(anchor === 'top' ? { top: 0 } : { bottom: 0 }),
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(30,40,60,0.045)',
        },
        gapStyle,
      ]}
    >
      <View style={{ width: 80, height: mascotH + 4, alignItems: 'center', justifyContent: 'center' }}>
        {phase === 'done' ? (
          <Animated.View style={[{ position: 'absolute' }, glowStyle]}>
            <MascotGlow size={64} />
          </Animated.View>
        ) : null}
        {phase === 'slow' && !reduce ? (
          <View style={{ position: 'absolute', top: mascotH * 0.38 }}>
            <MascotRings width={70} />
          </View>
        ) : null}
        {phase === 'loading' && !reduce ? (
          <View style={{ position: 'absolute', bottom: -10 }}>
            <MascotSpeedLines width={24} />
          </View>
        ) : null}
        <Animated.View style={[{ position: 'absolute', bottom: -3 }, shadowStyle]}>
          <MascotShadow width={30} />
        </Animated.View>
        <Animated.View style={[{ transformOrigin: 'bottom' }, mascotStyle]}>
          <SparkMascot mood={moodOf(phase, reduce)} size={MASCOT_W} />
        </Animated.View>
      </View>
      <Animated.View style={captionStyle}>
        <Text variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, marginTop: 2 }}>
          {caption}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

// ── Vùng cuộn có kéo-làm-mới ─────────────────────────────────────────
//
// Android không có "kéo quá đầu" và ScrollView gốc giành mọi cử chỉ dọc trước JS — nên không bắt cử chỉ bằng JS.
// Thay vào đó: một vùng kéo cao PULL_ZONE nằm sẵn phía trên nội dung, danh sách mở ra đã cuộn qua vùng đó. Kéo xuống
// ở đầu danh sách = cuộn gốc (mượt) vào vùng kéo — linh vật nằm trong đó. Thả tay: đủ ngưỡng thì giữ khe HOLD và làm
// mới, chưa đủ thì bật về.

const PULL_ZONE = 150;

/** Props gắn lên Animated.ScrollView / Animated.FlatList bên trong PullRefresh. */
export type PullScrollProps = {
  ref: AnimatedRef<Animated.ScrollView>;
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  scrollEventThrottle: number;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  overScrollMode?: 'never';
  alwaysBounceVertical?: boolean;
  contentOffset?: { x: number; y: number };
  onLayout?: (e: LayoutChangeEvent) => void;
  onContentSizeChange?: (w: number, h: number) => void;
  style: { flex: number; backgroundColor: string };
};

export type PullRenderArgs = {
  scroll: PullScrollProps;
  /** Đặt ở ĐẦU nội dung cuộn (Android: vùng kéo; iOS: null). */
  top: React.ReactNode;
  /** Gộp vào contentContainerStyle (Android: đủ cao để luôn cuộn qua được vùng kéo). */
  contentStyle: { minHeight: number } | null;
};

export function PullRefresh({
  onRefresh,
  refreshing,
  children,
}: {
  onRefresh?: () => unknown;
  refreshing?: boolean;
  children: (args: PullRenderArgs) => React.ReactNode;
}) {
  const ios = Platform.OS === 'ios';
  const ref = useAnimatedRef<Animated.ScrollView>();
  const pull = useSharedValue(0);
  const scrollY = useSharedValue(ios ? 0 : PULL_ZONE);
  const busySV = useSharedValue(0);
  const dragging = useSharedValue(0);
  const level = useSharedValue(0); // 0 nghỉ · 1 kéo · 2 đủ ngưỡng (chỉ báo JS khi đổi)
  const [held, setHeld] = useState(false); // iOS: RefreshControl đang giữ chỗ
  const [viewportH, setViewportH] = useState(() => Dimensions.get('window').height);
  const placed = useRef(false);

  const close = useCallback(() => {
    if (ios) {
      setHeld(false);
      return;
    }
    runOnUI(() => {
      'worklet';
      if (scrollY.value < PULL_ZONE) scrollTo(ref, 0, PULL_ZONE, true);
    })();
  }, [ios, ref, scrollY]);

  const m = useRefreshMachine({ onRefresh, refreshing, close });
  const machine = useRef(m);
  machine.current = m;
  useEffect(() => {
    busySV.value = m.busy ? 1 : 0;
  }, [m.busy, busySV]);

  const startFromUI = useCallback(() => {
    machine.current.start();
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      scrollY.value = y;
      pull.value = ios ? Math.max(0, -y) : Math.max(0, PULL_ZONE - y);
    },
    onBeginDrag: () => {
      dragging.value = 1;
    },
    onEndDrag: (e) => {
      dragging.value = 0;
      if (ios) return;
      const y = e.contentOffset.y;
      if (busySV.value === 0 && PULL_ZONE - y >= PULL_THRESHOLD) {
        busySV.value = 1;
        scrollTo(ref, 0, PULL_ZONE - HOLD, true);
        runOnJS(startFromUI)();
      } else if (busySV.value === 0 && y < PULL_ZONE) {
        scrollTo(ref, 0, PULL_ZONE, true);
      } else if (busySV.value === 1 && y < PULL_ZONE - HOLD) {
        scrollTo(ref, 0, PULL_ZONE - HOLD, true);
      }
    },
    onMomentumEnd: (e) => {
      if (ios) return;
      // Vuốt mạnh lên đầu: quán tính trôi vào vùng kéo → bật về (không tính là kéo làm mới).
      const y = e.contentOffset.y;
      if (busySV.value === 0 && y < PULL_ZONE) scrollTo(ref, 0, PULL_ZONE, true);
      else if (busySV.value === 1 && y < PULL_ZONE - HOLD) scrollTo(ref, 0, PULL_ZONE - HOLD, true);
    },
  });

  // Trạng thái kéo (nhìn xuống / nheo mắt + rung) — chỉ khi đang kéo tay (Android) và không bận.
  const setDragFromUI = useCallback((n: number) => {
    machine.current.setDrag(n === 2 ? 'armed' : n === 1 ? 'pull' : 'rest');
  }, []);
  useAnimatedReaction(
    () => {
      if (busySV.value === 1) return -1;
      if (!ios && dragging.value === 0) return 0;
      return pull.value >= PULL_THRESHOLD ? 2 : pull.value > 2 ? 1 : 0;
    },
    (next) => {
      if (next < 0 || next === level.value) return;
      level.value = next;
      runOnJS(setDragFromUI)(next);
    },
    [ios, setDragFromUI]
  );

  const indicator = (anchor: 'top' | 'bottom') => (
    <RefreshIndicator pull={pull} phase={m.phase} slowNote={m.slowNote} doneAt={m.doneAt} anchor={anchor} />
  );

  if (ios) {
    const scroll: PullScrollProps = {
      ref,
      onScroll,
      scrollEventThrottle: 16,
      alwaysBounceVertical: true,
      style: { flex: 1, backgroundColor: 'transparent' },
      refreshControl: (
        <RefreshControl
          refreshing={held}
          onRefresh={() => {
            setHeld(true);
            if (!machine.current.start()) setHeld(false);
          }}
          tintColor="transparent"
          style={{ backgroundColor: 'transparent' }}
        />
      ),
    };
    return (
      <PullContext.Provider value={pull}>
        <View style={{ flex: 1 }}>
          {indicator('top')}
          {children({ scroll, top: null, contentStyle: null })}
        </View>
      </PullContext.Provider>
    );
  }

  const scroll: PullScrollProps = {
    ref,
    onScroll,
    scrollEventThrottle: 16,
    overScrollMode: 'never',
    contentOffset: { x: 0, y: PULL_ZONE },
    style: { flex: 1, backgroundColor: 'transparent' },
    onLayout: (e) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0 && h !== viewportH) setViewportH(h);
    },
    onContentSizeChange: () => {
      // contentOffset ban đầu có máy không áp — đặt lại một lần cho chắc.
      if (placed.current) return;
      placed.current = true;
      runOnUI(() => {
        'worklet';
        if (scrollY.value < PULL_ZONE) scrollTo(ref, 0, PULL_ZONE, false);
      })();
    },
  };
  return (
    <PullContext.Provider value={pull}>
      {children({
        scroll,
        top: <View style={{ height: PULL_ZONE }}>{indicator('bottom')}</View>,
        contentStyle: { minHeight: viewportH + PULL_ZONE },
      })}
    </PullContext.Provider>
  );
}

function renderListHeader(header: FlatListProps<unknown>['ListHeaderComponent']) {
  if (!header) return null;
  if (isValidElement(header)) return header;
  const Header = header as React.ComponentType;
  return <Header />;
}

/** FlatList có kéo-làm-mới kiểu Spark (thay cho refreshControl={<RefreshControl …/>}). */
export function RefreshFlatList<T>({
  refreshing,
  onRefresh,
  ...rest
}: Omit<FlatListProps<T>, 'refreshing' | 'onRefresh' | 'refreshControl'> & { refreshing?: boolean; onRefresh?: () => unknown }) {
  const List = Animated.FlatList as unknown as React.ComponentType<FlatListProps<T> & { ref?: unknown }>;
  if (!onRefresh) return <List {...rest} />;
  return (
    <PullRefresh refreshing={refreshing} onRefresh={onRefresh}>
      {({ scroll, top, contentStyle }) => (
        <List
          {...rest}
          {...(scroll as object)}
          style={[scroll.style, rest.style]}
          contentContainerStyle={[rest.contentContainerStyle, contentStyle]}
          ListHeaderComponent={
            top ? (
              <>
                {top}
                {renderListHeader(rest.ListHeaderComponent as FlatListProps<unknown>['ListHeaderComponent'])}
              </>
            ) : (
              rest.ListHeaderComponent
            )
          }
        />
      )}
    </PullRefresh>
  );
}

/** ScrollView có kéo-làm-mới kiểu Spark (thay cho refreshControl={<RefreshControl …/>}). */
export function RefreshScrollView({
  refreshing,
  onRefresh,
  children,
  contentContainerStyle,
  contentContainerClassName,
  ...rest
}: Omit<ScrollViewProps, 'refreshControl'> & { refreshing?: boolean; onRefresh?: () => unknown; contentContainerClassName?: string }) {
  const Scroll = Animated.ScrollView as unknown as React.ComponentType<ScrollViewProps & { ref?: unknown; contentContainerClassName?: string }>;
  if (!onRefresh) {
    return (
      <Scroll {...rest} contentContainerStyle={contentContainerStyle} contentContainerClassName={contentContainerClassName}>
        {children}
      </Scroll>
    );
  }
  return (
    <PullRefresh refreshing={refreshing} onRefresh={onRefresh}>
      {({ scroll, top, contentStyle }) =>
        top ? (
          // Android: vùng kéo nằm ngoài phần đệm của nội dung → đệm / khoảng cách chuyển vào khung bên trong.
          <Scroll {...rest} {...(scroll as object)} style={[scroll.style, rest.style]} contentContainerStyle={contentStyle}>
            {top}
            <View style={contentContainerStyle} className={contentContainerClassName}>
              {children}
            </View>
          </Scroll>
        ) : (
          <Scroll
            {...rest}
            {...(scroll as object)}
            style={[scroll.style, rest.style]}
            contentContainerStyle={contentContainerStyle}
            contentContainerClassName={contentContainerClassName}
          >
            {children}
          </Scroll>
        )
      }
    </PullRefresh>
  );
}

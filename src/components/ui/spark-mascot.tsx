import { useId } from 'react';
import Svg, { ClipPath, Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

// ----------------------------------------------------------------------
// Linh vật tia chớp của Spark Store (kéo để làm mới…): mặt bo mềm màu hồng nhạt đè lên đuôi hồng đậm, bóng dưới
// mặt + vệt sáng phía trên cho cảm giác khối. Chỉ vẽ tĩnh theo `mood`; chuyển động (nảy, quay, phát sáng) do nơi
// dùng làm bằng Reanimated. Mã màu cố định (thương hiệu), không theo màu cửa hàng.
// ----------------------------------------------------------------------

export type MascotMood = 'idle' | 'look' | 'blink' | 'spin' | 'error';

const FACE =
  'M48 7 C66 5 86 6 98 8 C108 10 111 18 108 27 C103 41 95 54 89 62 C85 68 80 70 70 70 C54 71 38 72 24 72 C13 72 8 65 12 56 C19 41 26 27 33 17 C37 10 41 8 48 7 Z';
const TAIL =
  'M54 60 C72 57 92 55 104 58 C115 61 117 71 111 79 C94 99 70 120 50 135 C42 141 33 137 36 127 C40 112 44 96 47 82 C48 70 47 62 54 60 Z';

/** Tỉ lệ cao / rộng của linh vật (viewBox 124 × 150). */
export const MASCOT_ASPECT = 150 / 124;

const PINK = { face: ['#F7A3C0', '#E25A8C'], tail: ['#DE4C86', '#AE1356'], shade: '#7A0A3C', ink: '#3A1730' } as const;
const GREY = { face: ['#E4E1DB', '#BDB9B1'], tail: ['#C9C5BD', '#9C988F'], shade: '#5F5E5A', ink: '#6B6A65' } as const;

function Eyes({ mood, ink }: { mood: MascotMood; ink: string }) {
  if (mood === 'blink') {
    return <Path d="M45 33 L54 40 L45 47 M77 33 L68 40 L77 47" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (mood === 'error') {
    return <Path d="M46 43 Q50.5 40 55 43 M67 43 Q71.5 40 76 43" fill="none" stroke={ink} strokeWidth={4.5} strokeLinecap="round" />;
  }
  if (mood === 'spin') {
    return (
      <G>
        <Rect x={52} y={32} width={26} height={7} rx={3.5} fill={ink} />
        <Rect x={50} y={43} width={26} height={7} rx={3.5} fill={ink} />
      </G>
    );
  }
  // idle / look: hai mắt viên thuốc nghiêng theo mặt; "look" hạ mắt xuống (đang nhìn ngón tay kéo).
  const y = mood === 'look' ? 33 : 28;
  return (
    <G transform="rotate(9 61 40)">
      <Rect x={49} y={y} width={9.5} height={20} rx={4.75} fill={ink} />
      <Rect x={65} y={y} width={9.5} height={20} rx={4.75} fill={ink} />
      <Circle cx={52} cy={y + 5} r={1.6} fill="#FFFFFF" opacity={0.7} />
      <Circle cx={68} cy={y + 5} r={1.6} fill="#FFFFFF" opacity={0.7} />
    </G>
  );
}

/** Linh vật tia chớp, rộng `size` (cao = size × MASCOT_ASPECT). */
export function SparkMascot({ mood = 'idle', size = 44 }: { mood?: MascotMood; size?: number }) {
  // id riêng cho từng hình: nhiều linh vật cùng màn không dùng nhầm gradient của nhau.
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const c = mood === 'error' ? GREY : PINK;
  return (
    <Svg width={size} height={size * MASCOT_ASPECT} viewBox="0 0 124 150">
      <Defs>
        <LinearGradient id={`${id}f`} x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor={c.face[0]} />
          <Stop offset="1" stopColor={c.face[1]} />
        </LinearGradient>
        <LinearGradient id={`${id}t`} x1="0.7" y1="0" x2="0.3" y2="1">
          <Stop offset="0" stopColor={c.tail[0]} />
          <Stop offset="1" stopColor={c.tail[1]} />
        </LinearGradient>
        <RadialGradient id={`${id}h`} cx="0.32" cy="0.28" r="0.55">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}s`} cx="0.5" cy="0.15" r="0.6">
          <Stop offset="0" stopColor={c.shade} stopOpacity={0.45} />
          <Stop offset="1" stopColor={c.shade} stopOpacity={0} />
        </RadialGradient>
        <ClipPath id={`${id}c`}>
          <Path d={TAIL} />
        </ClipPath>
      </Defs>
      <Path d={TAIL} fill={`url(#${id}t)`} />
      <Ellipse cx={80} cy={64} rx={34} ry={15} fill={`url(#${id}s)`} clipPath={`url(#${id}c)`} />
      <Path d="M109 65 C112 70 110 75 105 80" fill="none" stroke="#FFFFFF" strokeOpacity={0.28} strokeWidth={3} strokeLinecap="round" />
      <Path d={FACE} fill={`url(#${id}f)`} />
      <Path d={FACE} fill={`url(#${id}h)`} />
      <Path d="M38 18 C46 13 62 12 78 13" fill="none" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={3.5} strokeLinecap="round" />
      <Eyes mood={mood} ink={c.ink} />
    </Svg>
  );
}

const SPARK = '#E2457F';

/** Quầng sáng hồng + tia nhỏ quanh linh vật (lúc "Đã cập nhật"). */
export function MascotGlow({ size = 72 }: { size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${id}g`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FF6FA3" stopOpacity={0.75} />
          <Stop offset="0.55" stopColor="#FF6FA3" stopOpacity={0.28} />
          <Stop offset="1" stopColor="#FF6FA3" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={50} fill={`url(#${id}g)`} />
      <Path d="M14 14 l7 -1 -3 6 6 -1" fill="none" stroke={SPARK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M84 66 l-7 1 3 -6 -6 1" fill="none" stroke={SPARK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={82} cy={24} r={2.6} fill={SPARK} />
      <Circle cx={88} cy={34} r={1.6} fill={SPARK} />
      <Circle cx={16} cy={78} r={2.2} fill={SPARK} />
      <Circle cx={24} cy={86} r={1.4} fill={SPARK} />
    </Svg>
  );
}

/** Vòng quỹ đạo mờ dần hai đầu (lúc "Tải lâu" — linh vật quay). */
export function MascotRings({ width = 76 }: { width?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={width} height={width * (64 / 108)} viewBox="0 0 108 64">
      <Defs>
        <LinearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={SPARK} stopOpacity={0} />
          <Stop offset="0.5" stopColor={SPARK} stopOpacity={0.7} />
          <Stop offset="1" stopColor={SPARK} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Ellipse cx={54} cy={40} rx={50} ry={10} fill="none" stroke={`url(#${id}r)`} strokeWidth={2} />
      <Ellipse cx={54} cy={40} rx={40} ry={7} fill="none" stroke={`url(#${id}r)`} strokeWidth={1.6} />
      <Ellipse cx={54} cy={40} rx={30} ry={5} fill="none" stroke={`url(#${id}r)`} strokeWidth={1.2} />
    </Svg>
  );
}

/** Ba vệt tốc độ dưới chân (lúc nảy). */
export function MascotSpeedLines({ width = 30 }: { width?: number }) {
  return (
    <Svg width={width} height={width * (24 / 40)} viewBox="0 0 40 24">
      <Path d="M10 3 L13 15 M20 1 L20 17 M30 3 L27 15" stroke={SPARK} strokeWidth={2.4} strokeLinecap="round" opacity={0.5} />
    </Svg>
  );
}

/** Bóng mềm dưới chân linh vật. */
export function MascotShadow({ width = 30 }: { width?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={width} height={width / 4} viewBox="0 0 40 10">
      <Defs>
        <RadialGradient id={`${id}d`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={PINK.shade} stopOpacity={0.3} />
          <Stop offset="1" stopColor={PINK.shade} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={20} cy={5} rx={20} ry={5} fill={`url(#${id}d)`} />
    </Svg>
  );
}

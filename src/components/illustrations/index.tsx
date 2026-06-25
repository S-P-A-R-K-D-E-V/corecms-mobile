// Lightweight branded SVG illustrations (react-native-svg, already a dep).
// Scheme-aware so they read on both light and dark surfaces. Use for empty
// states, onboarding slides, and the login hero.
import { useColorScheme } from 'nativewind';
import Svg, { Circle, Rect, Path, G, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { brand } from 'src/theme';

export type IllustrationProps = { size?: number };

function usePalette() {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  return {
    dark,
    surface: dark ? '#2C2C2E' : '#FFFFFF',
    line: dark ? '#48484A' : '#E5E5EA',
    backdrop: dark ? 'rgba(200,77,113,0.16)' : '#FBEAF0',
    ink: dark ? '#F5F5F7' : '#1C1C1E',
    faint: dark ? '#5A5A5E' : '#D9D9DE',
  };
}

/** Rounded backdrop shared by all illustrations. */
function Backdrop({ p }: { p: ReturnType<typeof usePalette> }) {
  return <Rect x={14} y={14} width={132} height={132} rx={40} fill={p.backdrop} />;
}

export function EmptyBoxIllustration({ size = 150 }: IllustrationProps) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Backdrop p={p} />
      <Circle cx={52} cy={44} r={5} fill={brand.primary} opacity={0.5} />
      <Circle cx={112} cy={56} r={4} fill={brand.secondary} opacity={0.6} />
      <Path d="M44 76 L80 62 L116 76 L80 90 Z" fill={brand.primary} opacity={0.9} />
      <Path d="M44 76 L44 108 L80 122 L80 90 Z" fill={p.surface} stroke={p.line} strokeWidth={2} />
      <Path d="M116 76 L116 108 L80 122 L80 90 Z" fill={p.surface} stroke={p.line} strokeWidth={2} />
      <Path d="M44 76 L80 90 L116 76" fill="none" stroke={brand.primary} strokeWidth={2} opacity={0.4} />
    </Svg>
  );
}

export function ChatIllustration({ size = 150 }: IllustrationProps) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Backdrop p={p} />
      <Path d="M40 56 q0 -10 10 -10 h44 q10 0 10 10 v22 q0 10 -10 10 H66 l-14 12 v-12 h-2 q-10 0 -10 -10 Z" fill={brand.primary} />
      <Path d="M70 86 q0 -8 8 -8 h32 q8 0 8 8 v16 q0 8 -8 8 h-2 v10 l-12 -10 H78 q-8 0 -8 -8 Z" fill={p.surface} stroke={p.line} strokeWidth={2} />
      <Circle cx={58} cy={67} r={3.4} fill="#FFFFFF" />
      <Circle cx={72} cy={67} r={3.4} fill="#FFFFFF" />
      <Circle cx={86} cy={67} r={3.4} fill="#FFFFFF" />
    </Svg>
  );
}

export function WalletIllustration({ size = 150 }: IllustrationProps) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Backdrop p={p} />
      <Rect x={42} y={58} width={76} height={50} rx={12} fill={brand.primary} />
      <Rect x={42} y={70} width={76} height={38} rx={12} fill={p.surface} stroke={p.line} strokeWidth={2} />
      <Rect x={94} y={82} width={30} height={16} rx={8} fill={brand.primary} opacity={0.18} />
      <Circle cx={108} cy={90} r={4} fill={brand.primary} />
      <Circle cx={96} cy={50} r={11} fill={brand.warning} />
      <Path d="M96 45 v10 M92 48 h8" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function CalendarIllustration({ size = 150 }: IllustrationProps) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Backdrop p={p} />
      <Rect x={44} y={50} width={72} height={62} rx={12} fill={p.surface} stroke={p.line} strokeWidth={2} />
      <Path d="M44 64 q0 -14 14 -14 h44 q14 0 14 14 v4 H44 Z" fill={brand.primary} />
      <Line x1={60} y1={44} x2={60} y2={56} stroke={brand.primary} strokeWidth={4} strokeLinecap="round" />
      <Line x1={100} y1={44} x2={100} y2={56} stroke={brand.primary} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={62} cy={82} r={4} fill={brand.faint} />
      <Circle cx={80} cy={82} r={4} fill={brand.primary} />
      <Circle cx={98} cy={82} r={4} fill={brand.faint} />
      <Circle cx={62} cy={98} r={4} fill={brand.faint} />
      <Circle cx={80} cy={98} r={4} fill={brand.faint} />
    </Svg>
  );
}

export function BellIllustration({ size = 150 }: IllustrationProps) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Backdrop p={p} />
      <Path d="M80 48 q22 0 22 26 v10 l8 12 H50 l8 -12 v-10 q0 -26 22 -26 Z" fill={p.surface} stroke={p.line} strokeWidth={2} />
      <Path d="M72 96 q0 10 8 10 q8 0 8 -10 Z" fill={brand.primary} />
      <Circle cx={80} cy={44} r={4} fill={brand.primary} />
      <Circle cx={104} cy={56} r={8} fill={brand.error} />
    </Svg>
  );
}

export function SwapIllustration({ size = 150 }: IllustrationProps) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Backdrop p={p} />
      <Path d="M52 68 h44 l-10 -10 M96 68 l-10 10" fill="none" stroke={brand.primary} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M108 92 H64 l10 -10 M64 92 l10 10" fill="none" stroke={brand.secondary} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TeamIllustration({ size = 150 }: IllustrationProps) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Backdrop p={p} />
      <Circle cx={64} cy={70} r={13} fill={brand.primary} />
      <Path d="M44 104 q0 -16 20 -16 q20 0 20 16 Z" fill={brand.primary} />
      <Circle cx={98} cy={66} r={11} fill={brand.secondary} />
      <Path d="M82 100 q0 -14 16 -14 q16 0 16 14 Z" fill={brand.secondary} />
    </Svg>
  );
}

export function CashIllustration({ size = 150 }: IllustrationProps) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Backdrop p={p} />
      <Rect x={46} y={64} width={68} height={40} rx={8} fill={brand.success} opacity={0.25} transform="rotate(-8 80 84)" />
      <Rect x={46} y={62} width={68} height={40} rx={8} fill={p.surface} stroke={p.line} strokeWidth={2} />
      <Circle cx={80} cy={82} r={11} fill={brand.success} />
      <Path d="M80 76 v12 M76 79 h8" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function FaceScanIllustration({ size = 160 }: IllustrationProps) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Backdrop p={p} />
      <Circle cx={80} cy={80} r={26} fill={p.surface} stroke={p.line} strokeWidth={2} />
      <Circle cx={72} cy={76} r={3} fill={brand.ink} />
      <Circle cx={88} cy={76} r={3} fill={brand.ink} />
      <Path d="M70 90 q10 8 20 0" fill="none" stroke={brand.primary} strokeWidth={3} strokeLinecap="round" />
      <Path d="M50 56 v-6 q0 -6 6 -6 h6 M110 56 v-6 q0 -6 -6 -6 h-6 M50 104 v6 q0 6 6 6 h6 M110 104 v6 q0 6 -6 6 h-6" fill="none" stroke={brand.primary} strokeWidth={4} strokeLinecap="round" />
    </Svg>
  );
}

export function WaveIllustration({ size = 160 }: IllustrationProps) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Backdrop p={p} />
      <Circle cx={80} cy={72} r={22} fill={brand.primary} />
      <Circle cx={72} cy={68} r={3} fill="#FFFFFF" />
      <Circle cx={88} cy={68} r={3} fill="#FFFFFF" />
      <Path d="M70 80 q10 8 20 0" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
      <Path d="M104 58 q10 -4 12 6 q2 10 -8 14" fill="none" stroke={brand.warning} strokeWidth={5} strokeLinecap="round" />
    </Svg>
  );
}

export function LoginHeroIllustration({ size = 200 }: IllustrationProps) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <LinearGradient id="loging" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E97AA0" />
          <Stop offset="1" stopColor={brand.primary} />
        </LinearGradient>
      </Defs>
      <Circle cx={100} cy={100} r={84} fill={p.backdrop} />
      <Rect x={66} y={40} width={68} height={120} rx={18} fill="url(#loging)" />
      <Rect x={74} y={52} width={52} height={96} rx={10} fill={p.surface} />
      <Circle cx={100} cy={92} r={16} fill={p.backdrop} />
      <Path d="M100 84 a8 8 0 1 1 -0.1 0 Z" fill={brand.primary} />
      <Path d="M88 112 q12 -12 24 0 v6 h-24 Z" fill={brand.primary} />
      <G stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round">
        <Path d="M118 150 l6 6 l12 -12" fill="none" />
      </G>
      <Circle cx={150} cy={64} r={6} fill={brand.warning} />
      <Circle cx={48} cy={120} r={5} fill={brand.secondary} />
    </Svg>
  );
}

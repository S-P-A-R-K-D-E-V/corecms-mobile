import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { brand } from 'src/theme';

export type ProgressRingProps = {
  size?: number;
  stroke?: number;
  /** 0–1. */
  progress: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
};

/** Circular determinate progress ring (SVG). */
export function ProgressRing({ size = 64, stroke = 6, progress, color = brand.primary, trackColor = 'rgba(0,0,0,0.08)', children }: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = c * (1 - clamped);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}

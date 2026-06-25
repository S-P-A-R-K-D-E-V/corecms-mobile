import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export type DonutSegment = { value: number; color: string };

export type DonutProps = {
  size?: number;
  stroke?: number;
  segments: DonutSegment[];
  trackColor?: string;
  children?: React.ReactNode;
};

/** Stacked donut chart (SVG) — pass segments + an optional center label. */
export function Donut({ size = 140, stroke = 22, segments, trackColor = 'rgba(0,0,0,0.06)', children }: DonutProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
  let acc = 0;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        {segments.map((s, i) => {
          const frac = Math.max(0, s.value) / total;
          const dash = c * frac;
          const offset = -acc * c;
          acc += frac;
          if (frac <= 0) return null;
          return (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={s.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
            />
          );
        })}
      </Svg>
      {children ? <View style={{ position: 'absolute', alignItems: 'center' }}>{children}</View> : null}
    </View>
  );
}

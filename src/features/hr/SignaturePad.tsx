import { useRef } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from 'src/components/ui';
import type { SignatureStroke } from 'src/types/hr';
import { extendStroke, startStroke, strokePath } from './signature-strokes';

// ----------------------------------------------------------------------
// Khung ký tay: ngón tay vẽ trong khung (PanResponder) → nét [x, y] theo toạ độ khung, vẽ ngay bằng SVG. Khung giữ cử chỉ
// cho tới khi nhấc tay (không nhường cho ScrollView cha), nên vẽ không làm cuộn màn hình.
// ----------------------------------------------------------------------

const INK = '#111827';

type Props = {
  strokes: SignatureStroke[];
  onChange: (strokes: SignatureStroke[]) => void;
  /** Kích thước khung (px) — gửi kèm nét để server dựng SVG đúng tỉ lệ. */
  onSize: (width: number, height: number) => void;
  height?: number;
  disabled?: boolean;
};

export function SignaturePad({ strokes, onChange, onSize, height = 180, disabled = false }: Props) {
  // PanResponder tạo một lần: đọc nét / callback mới nhất qua ref.
  const latest = useRef({ strokes, onChange, disabled });
  latest.current = { strokes, onChange, disabled };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onStartShouldSetPanResponderCapture: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponderCapture: () => !latest.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        const next = startStroke(latest.current.strokes, locationX, locationY);
        latest.current.strokes = next;
        latest.current.onChange(next);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        const next = extendStroke(latest.current.strokes, locationX, locationY);
        if (next === latest.current.strokes) return;
        latest.current.strokes = next;
        latest.current.onChange(next);
      },
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => onSize(e.nativeEvent.layout.width, e.nativeEvent.layout.height);

  return (
    <View
      onLayout={onLayout}
      style={{ height }}
      className="rounded-xl border border-dashed border-line dark:border-line-dark bg-white overflow-hidden"
      testID="signature-pad"
      {...responder.panHandlers}
    >
      <Svg width="100%" height="100%" pointerEvents="none">
        {strokes.map((s, i) => (
          <Path key={i} d={strokePath(s)} stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
      </Svg>
      {strokes.length === 0 ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <Text variant="caption" style={{ color: '#9CA3AF' }}>Ký tên vào đây</Text>
        </View>
      ) : null}
    </View>
  );
}

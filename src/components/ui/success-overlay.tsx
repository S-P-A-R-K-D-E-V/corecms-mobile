import { useEffect } from 'react';
import { Modal, View } from 'react-native';
import { MotiView } from 'moti';
import { Text } from './text';
import { Icon } from './icon';
import { spring } from 'src/theme/motion';
import { softShadow, brand } from 'src/theme';
import { haptics } from 'src/services/haptics';

const CONFETTI = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2);
const CONFETTI_COLORS = [brand.primary, brand.secondary, brand.success, brand.warning];

export type SuccessOverlayProps = {
  visible: boolean;
  message?: string;
  onDone?: () => void;
  duration?: number;
};

/** Celebratory success animation: spring check + confetti burst. Pure moti/SVG
 *  (no Lottie dep). Calls `onDone` after `duration`. */
export function SuccessOverlay({ visible, message, onDone, duration = 1600 }: SuccessOverlayProps) {
  useEffect(() => {
    if (!visible) return;
    haptics.success();
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [visible, duration, onDone]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
          {CONFETTI.map((angle, i) => (
            <MotiView
              key={i}
              from={{ translateX: 0, translateY: 0, opacity: 1, scale: 1 }}
              animate={{ translateX: Math.cos(angle) * 110, translateY: Math.sin(angle) * 110, opacity: 0, scale: 0.3 }}
              transition={{ type: 'timing', duration: 900, delay: 140 }}
              style={{
                position: 'absolute',
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              }}
            />
          ))}
          <MotiView
            from={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', ...spring.bounce }}
            className="w-28 h-28 rounded-full bg-white items-center justify-center"
            style={softShadow}
          >
            <MotiView from={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', ...spring.bounce, delay: 140 }}>
              <Icon name="check-bold" size={56} tone="primary" />
            </MotiView>
          </MotiView>
        </View>
        {message ? (
          <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', delay: 260 }}>
            <Text className="text-white font-bold text-lg mt-4 text-center px-8">{message}</Text>
          </MotiView>
        ) : null}
      </View>
    </Modal>
  );
}

import { Modal, View, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { Text } from '../ui/text';
import { Icon } from '../ui/icon';
import { GlassView } from '../ui/glass';
import { spring, duration } from 'src/theme/motion';
import { blur } from 'src/theme';

export type SheetProps = {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/** Apple-style bottom sheet: frosted glass surface, spring slide-up, dimmed
 *  backdrop fading to 0.35. */
export function Sheet({ visible, title, onClose, children, footer }: SheetProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent onRequestClose={onClose} statusBarTranslucent animationType="none">
      {/* Backdrop */}
      <MotiView
        from={{ opacity: 0 }}
        animate={{ opacity: 0.35 }}
        transition={{ type: 'timing', duration: duration.normal }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }}
      />
      <Pressable className="flex-1" onPress={onClose} />

      {/* Sheet body */}
      <MotiView
        from={{ translateY: 700 }}
        animate={{ translateY: 0 }}
        transition={{ type: 'spring', ...spring.soft }}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        <GlassView intensity={blur.sheet} className="rounded-t-[28px] border-t border-glass-border dark:border-glass-border-dark">
          <View style={{ maxHeight: height * 0.88, paddingBottom: insets.bottom }}>
            <View className="items-center pt-3">
              <View className="w-10 h-1.5 rounded-full bg-faint/60" />
            </View>
            {title ? (
              <View className="flex-row items-center justify-between px-5 pt-2 pb-1">
                <Text variant="title2">{title}</Text>
                <Pressable onPress={onClose} className="w-9 h-9 items-center justify-center rounded-full bg-ink/5 dark:bg-white/10">
                  <Icon name="close" size={20} tone="muted" />
                </Pressable>
              </View>
            ) : null}
            <ScrollView contentContainerClassName="px-5 py-2" keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View className="px-5 pt-2 pb-1 gap-2 border-t border-glass-border dark:border-glass-border-dark">{footer}</View> : null}
          </View>
        </GlassView>
      </MotiView>
    </Modal>
  );
}

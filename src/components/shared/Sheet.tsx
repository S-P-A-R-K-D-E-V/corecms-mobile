import { useEffect, useState } from 'react';
import { Modal, View, Pressable, ScrollView, useWindowDimensions, Keyboard, Platform } from 'react-native';
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

  // Đẩy sheet lên trên bàn phím để ô input đang nhập không bị che.
  // Sheet neo ở đáy trong Modal nên KeyboardAvoidingView không đáng tin —
  // ta tự nghe sự kiện bàn phím và nâng sheet bằng đúng chiều cao bàn phím.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    if (!visible) return undefined;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  // Khi bàn phím hiện, neo sheet ngay trên bàn phím (bỏ phần safe-area dưới
  // vì bàn phím đã che vùng đó); khi ẩn thì trả về vị trí đáy bình thường.
  const kbVisible = kbHeight > 0;
  const sheetBottom = kbVisible ? kbHeight : 0;
  const bodyPadBottom = kbVisible ? 12 : insets.bottom;
  const maxBodyHeight = height * 0.88 - (kbVisible ? kbHeight : 0);

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
        style={{ position: 'absolute', left: 0, right: 0, bottom: sheetBottom }}
      >
        <GlassView intensity={blur.sheet} className="rounded-t-[28px] border-t border-glass-border dark:border-glass-border-dark">
          <View style={{ maxHeight: maxBodyHeight, paddingBottom: bodyPadBottom }}>
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

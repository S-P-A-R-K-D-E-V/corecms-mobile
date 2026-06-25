// Single render host for the imperative overlay system. Mount once at the app
// root (above the navigator). Renders stacked toasts, the confirm dialog, and
// the action sheet — all themed with the DS tokens.
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatePresence, MotiView } from 'moti';

import { Text } from 'src/components/ui/text';
import { Button } from 'src/components/ui/button';
import { Icon, type IconName } from 'src/components/ui/icon';
import { GlassView } from 'src/components/ui/glass';
import { PressableScale } from 'src/components/ui/pressable-scale';
import { cn } from 'src/components/ui/utils';
import { spring, duration } from 'src/theme/motion';
import { blur, brand } from 'src/theme';
import { haptics } from 'src/services/haptics';

import { useOverlayStore, type ToastType } from './overlay-store';

const TOAST_META: Record<ToastType, { icon: IconName; ring: string; iconColor: string }> = {
  success: { icon: 'check-circle', ring: 'border-success/30', iconColor: brand.success },
  error: { icon: 'alert-circle', ring: 'border-error/30', iconColor: brand.error },
  info: { icon: 'information', ring: 'border-secondary/30', iconColor: brand.secondary },
  warning: { icon: 'alert', ring: 'border-warning/40', iconColor: brand.warning },
};

function Toasts() {
  const insets = useSafeAreaInsets();
  const toasts = useOverlayStore((s) => s.toasts);
  const dismiss = useOverlayStore((s) => s.dismissToast);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, alignItems: 'center' }}
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const m = TOAST_META[t.type];
          return (
            <MotiView
              key={t.id}
              from={{ opacity: 0, translateY: -20, scale: 0.96 }}
              animate={{ opacity: 1, translateY: 0, scale: 1 }}
              exit={{ opacity: 0, translateY: -16, scale: 0.96 }}
              transition={{ type: 'spring', ...spring.soft }}
              style={{ width: '92%', marginBottom: 8 }}
            >
              <Pressable onPress={() => dismiss(t.id)}>
                <GlassView
                  intensity={blur.header}
                  className={cn('flex-row items-center gap-3 rounded-2xl border px-4 py-3', m.ring)}
                >
                  <Icon name={m.icon} size={22} color={m.iconColor} />
                  <View className="flex-1">
                    {t.title ? <Text variant="subtitle" className="text-[15px]">{t.title}</Text> : null}
                    <Text variant={t.title ? 'bodySmall' : 'body'} tone={t.title ? 'muted' : 'default'}>
                      {t.message}
                    </Text>
                  </View>
                </GlassView>
              </Pressable>
            </MotiView>
          );
        })}
      </AnimatePresence>
    </View>
  );
}

function ConfirmDialog() {
  const dialog = useOverlayStore((s) => s.dialog);
  const setDialog = useOverlayStore((s) => s.setDialog);

  function close(ok: boolean) {
    dialog.resolve?.(ok);
    setDialog({ ...dialog, visible: false, resolve: undefined });
  }

  return (
    <Modal visible={dialog.visible} transparent animationType="none" onRequestClose={() => close(false)}>
      <MotiView
        from={{ opacity: 0 }}
        animate={{ opacity: dialog.visible ? 0.4 : 0 }}
        transition={{ type: 'timing', duration: duration.fast }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }}
      />
      <Pressable className="flex-1 items-center justify-center px-8" onPress={() => close(false)}>
        <MotiView
          from={{ opacity: 0, scale: 0.9, translateY: 12 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: 'spring', ...spring.soft }}
          style={{ width: '100%' }}
        >
          <Pressable onPress={() => {}}>
            <GlassView intensity={blur.sheet} className="rounded-[24px] border border-glass-border dark:border-glass-border-dark p-5">
              {dialog.destructive ? (
                <View className="self-center mb-2 w-12 h-12 rounded-full bg-error-soft items-center justify-center">
                  <Icon name="alert" size={26} tone="error" />
                </View>
              ) : null}
              {dialog.title ? (
                <Text variant="title2" className="text-center">{dialog.title}</Text>
              ) : null}
              {dialog.message ? (
                <Text tone="muted" className="text-center mt-1.5 leading-5">{dialog.message}</Text>
              ) : null}
              <View className="flex-row gap-2.5 mt-5">
                <View className="flex-1">
                  <Button variant="outline" action="neutral" onPress={() => close(false)}>
                    {dialog.cancelText}
                  </Button>
                </View>
                <View className="flex-1">
                  <Button
                    action={dialog.destructive ? 'error' : 'primary'}
                    onPress={() => { haptics.medium(); close(true); }}
                  >
                    {dialog.confirmText}
                  </Button>
                </View>
              </View>
            </GlassView>
          </Pressable>
        </MotiView>
      </Pressable>
    </Modal>
  );
}

function ActionSheetHost() {
  const insets = useSafeAreaInsets();
  const sheet = useOverlayStore((s) => s.sheet);
  const setSheet = useOverlayStore((s) => s.setSheet);

  function close() {
    sheet.resolve?.();
    setSheet({ ...sheet, visible: false, resolve: undefined });
  }

  return (
    <Modal visible={sheet.visible} transparent animationType="none" onRequestClose={close}>
      <MotiView
        from={{ opacity: 0 }}
        animate={{ opacity: sheet.visible ? 0.4 : 0 }}
        transition={{ type: 'timing', duration: duration.fast }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }}
      />
      <Pressable className="flex-1" onPress={close} />
      <MotiView
        from={{ translateY: 500 }}
        animate={{ translateY: 0 }}
        transition={{ type: 'spring', ...spring.soft }}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 10 }}
      >
        <View style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
          <GlassView intensity={blur.sheet} className="rounded-[24px] border border-glass-border dark:border-glass-border-dark overflow-hidden">
            {sheet.title || sheet.message ? (
              <View className="items-center px-5 pt-4 pb-2 border-b border-glass-border dark:border-glass-border-dark">
                {sheet.title ? <Text variant="subtitle">{sheet.title}</Text> : null}
                {sheet.message ? <Text tone="muted" variant="bodySmall" className="text-center mt-0.5">{sheet.message}</Text> : null}
              </View>
            ) : null}
            {sheet.options.map((opt, i) => (
              <PressableScale
                key={i}
                onPress={() => {
                  haptics.light();
                  close();
                  // Defer so the sheet's exit doesn't race the callback's nav/UI.
                  setTimeout(() => opt.onPress?.(), 60);
                }}
              >
                <View className={cn('flex-row items-center gap-3 px-5 py-4', i > 0 && 'border-t border-glass-border dark:border-glass-border-dark')}>
                  {opt.icon ? <Icon name={opt.icon} size={22} tone={opt.destructive ? 'error' : 'primary'} /> : null}
                  <Text variant="body" className="font-medium" tone={opt.destructive ? 'error' : 'default'}>
                    {opt.label}
                  </Text>
                </View>
              </PressableScale>
            ))}
          </GlassView>
          <View className="mt-2">
            <GlassView intensity={blur.sheet} className="rounded-[20px] border border-glass-border dark:border-glass-border-dark overflow-hidden">
              <PressableScale onPress={close}>
                <View className="items-center py-4">
                  <Text variant="subtitle" tone="muted">Huỷ</Text>
                </View>
              </PressableScale>
            </GlassView>
          </View>
        </View>
      </MotiView>
    </Modal>
  );
}

/** Mount once at the app root, above the navigator. */
export function OverlayHost() {
  return (
    <>
      <ConfirmDialog />
      <ActionSheetHost />
      <Toasts />
    </>
  );
}

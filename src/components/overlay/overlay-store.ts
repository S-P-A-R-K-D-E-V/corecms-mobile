// Imperative overlay system (Toast / Dialog / ActionSheet) backed by a tiny
// zustand store. Call `toast.success(...)`, `await confirm(...)`,
// `await showActionSheet(...)` from anywhere — no context plumbing needed.
// A single <OverlayHost/> mounted at the root renders everything.
import { create } from 'zustand';
import type { IconName } from 'src/components/ui/icon';

export type ToastType = 'success' | 'error' | 'info' | 'warning';
export type ToastItem = { id: string; type: ToastType; message: string; title?: string };

export type ActionItem = {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress?: () => void;
};

export type DialogState = {
  visible: boolean;
  title?: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  destructive?: boolean;
  resolve?: (ok: boolean) => void;
};

export type ActionSheetState = {
  visible: boolean;
  title?: string;
  message?: string;
  options: ActionItem[];
  resolve?: () => void;
};

type OverlayStore = {
  toasts: ToastItem[];
  dialog: DialogState;
  sheet: ActionSheetState;
  pushToast: (t: ToastItem) => void;
  dismissToast: (id: string) => void;
  setDialog: (d: DialogState) => void;
  setSheet: (s: ActionSheetState) => void;
};

const emptyDialog: DialogState = { visible: false, confirmText: 'Đồng ý', cancelText: 'Huỷ' };
const emptySheet: ActionSheetState = { visible: false, options: [] };

export const useOverlayStore = create<OverlayStore>((set) => ({
  toasts: [],
  dialog: emptyDialog,
  sheet: emptySheet,
  pushToast: (t) => set((s) => ({ toasts: [...s.toasts, t].slice(-3) })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  setDialog: (dialog) => set({ dialog }),
  setSheet: (sheet) => set({ sheet }),
}));

// ── Imperative API ───────────────────────────────────────────────────────────
let seq = 0;
const TOAST_MS = 2800;

function emit(type: ToastType, message: string, title?: string) {
  const id = `t${Date.now()}_${seq++}`;
  useOverlayStore.getState().pushToast({ id, type, message, title });
  setTimeout(() => useOverlayStore.getState().dismissToast(id), TOAST_MS);
}

export const toast = {
  success: (message: string, title?: string) => emit('success', message, title),
  error: (message: string, title?: string) => emit('error', message, title),
  info: (message: string, title?: string) => emit('info', message, title),
  warning: (message: string, title?: string) => emit('warning', message, title),
};

export type ConfirmOptions = {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

/** Promise-based confirm dialog. Resolves true on confirm, false on cancel. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useOverlayStore.getState().setDialog({
      visible: true,
      title: opts.title,
      message: opts.message,
      confirmText: opts.confirmText ?? 'Đồng ý',
      cancelText: opts.cancelText ?? 'Huỷ',
      destructive: opts.destructive,
      resolve,
    });
  });
}

export type ActionSheetOptions = {
  title?: string;
  message?: string;
  options: ActionItem[];
};

/** Bottom action sheet with tappable options. Resolves once dismissed. */
export function showActionSheet(opts: ActionSheetOptions): Promise<void> {
  return new Promise((resolve) => {
    useOverlayStore.getState().setSheet({
      visible: true,
      title: opts.title,
      message: opts.message,
      options: opts.options,
      resolve,
    });
  });
}

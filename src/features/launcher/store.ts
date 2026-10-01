import { useEffect } from 'react';
import { create } from 'zustand';

import { prefs, PrefKeys } from 'src/services/storage';
import { DEFAULT_PINS, MAX_PINS, type LauncherVariant } from './registry';

// ----------------------------------------------------------------------
// State ghim tiện ích của feature-grid, đồng bộ giữa grid ↔ màn tùy chỉnh ↔
// Cài đặt. Lưu bền vào AsyncStorage (prefs). Zustand để mọi nơi cùng phản ánh
// tức thì khi user chỉnh. Không cần backend (local-first; đồng bộ để Phase sau).
// ----------------------------------------------------------------------

type Pins = Record<LauncherVariant, string[]>;

// v2: trang chủ kiểu MB (tối đa 8 ghim, thêm nhóm Bán hàng) — bộ ghim cũ (11–12 mục, chưa có Bán hàng)
// không còn hợp, nạp lại mặc định một lần.
const PINS_VERSION = 2;

type LauncherState = {
  pins: Pins;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPins: (variant: LauncherVariant, keys: string[]) => void;
  reset: (variant: LauncherVariant) => void;
};

function persist(pins: Pins) {
  prefs.set(PrefKeys.launcherPins, JSON.stringify({ v: PINS_VERSION, ...pins })).catch(() => {});
}

export const useLauncherStore = create<LauncherState>((set, get) => ({
  pins: { ...DEFAULT_PINS },
  hydrated: false,

  async hydrate() {
    if (get().hydrated) return;
    try {
      const raw = await prefs.get(PrefKeys.launcherPins);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Pins> & { v?: number };
        if (parsed.v !== PINS_VERSION) {
          set({ hydrated: true });
          return;
        }
        set({
          pins: {
            staff: parsed.staff ?? DEFAULT_PINS.staff,
            admin: parsed.admin ?? DEFAULT_PINS.admin,
          },
          hydrated: true,
        });
        return;
      }
    } catch {
      // JSON hỏng → dùng mặc định.
    }
    set({ hydrated: true });
  },

  setPins(variant, keys) {
    // Màn tùy chỉnh truyền danh sách đã lọc theo quyền — cắt ở đây là chốt chặn cuối cho giới hạn 8.
    const pins = { ...get().pins, [variant]: [...new Set(keys)].slice(0, MAX_PINS) };
    set({ pins });
    persist(pins);
  },

  reset(variant) {
    const pins = { ...get().pins, [variant]: [...DEFAULT_PINS[variant]] };
    set({ pins });
    persist(pins);
  },
}));

/** Nạp state 1 lần khi app khởi động (gọi ở root layout). */
export function useHydrateLauncher() {
  const hydrate = useLauncherStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
}

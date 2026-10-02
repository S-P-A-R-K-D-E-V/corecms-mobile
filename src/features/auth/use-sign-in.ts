import { useCallback } from 'react';
import { router } from 'expo-router';

import { prefs, PrefKeys } from 'src/services/storage';
import { useDiscovery, type Pending } from './discovery';
import { chooseStore, normalizeStoreField, type StoreChoice } from './sign-in';
import { useEnterStore } from './use-enter-store';

// ----------------------------------------------------------------------
// Đi tiếp sau khi đã tìm được các cửa hàng của tài khoản (app-hub/discover hoặc đổi mã đăng nhập web):
//   1 cửa hàng / đúng cửa hàng người dùng gõ → vào thẳng; nhiều → màn chọn cửa hàng (dùng gần nhất lên đầu);
//   không có → lời nhắn trên trang đăng nhập (Google/Apple) hoặc lỗi ngay dưới ô (email — màn gọi tự hiện).
// ----------------------------------------------------------------------

type ProceedOptions = {
  /** Cửa hàng người dùng chỉ định (ô cửa hàng / trang đăng nhập của cửa hàng). */
  wanted?: { code: string; host?: string | null } | null;
  mode?: 'strict' | 'prefer';
  /** 'replace' khi đang ở màn trung gian (auth/hub) — không để màn đó lại trong stack. */
  nav?: 'push' | 'replace';
  /** Không có cửa hàng nào → hiện lời nhắn "chưa có cửa hàng" trên trang đăng nhập (mặc định có). */
  notice?: boolean;
};

export function useAfterDiscovery() {
  const { enter, entering } = useEnterStore();

  /** Trả về lựa chọn + đã vào được cửa hàng chưa (false: đã báo lỗi / không phải trường hợp vào thẳng). */
  const proceed = useCallback(
    async (pending: Pending, options: ProceedOptions = {}): Promise<{ choice: StoreChoice; entered: boolean }> => {
      const { wanted = null, mode = 'strict', nav = 'push', notice = true } = options;
      const choice = chooseStore(pending.result.stores, wanted, mode);
      switch (choice.kind) {
        case 'enter': {
          const entered = await enter(choice.code);
          // Không vào được (đã báo lỗi): bỏ luôn kết quả discover — không giữ mật khẩu / token trong bộ nhớ
          // khi không còn màn nào dùng tới (bấm lại "Đăng nhập" sẽ chạy discover mới).
          if (!entered) useDiscovery.getState().clear();
          return { choice, entered };
        }
        case 'pick':
          if (nav === 'replace') router.replace('/store-picker' as any);
          else router.push('/store-picker' as any);
          return { choice, entered: false };
        default: {
          // Không vào được cửa hàng nào: bỏ kết quả discover (kèm token / mật khẩu đang giữ để làm mới vé).
          const discovery = useDiscovery.getState();
          if (choice.kind === 'none' && notice) discovery.showNoStore({ email: pending.result.email, via: pending.via });
          else discovery.clear();
          return { choice, entered: false };
        }
      }
    },
    [enter]
  );

  return { proceed, entering };
}

/** Ô cửa hàng gõ lần trước (mã / tên miền, không bí mật) — điền sẵn lần sau. */
export async function loadLastStoreField(): Promise<string> {
  try {
    return normalizeStoreField(await prefs.get(PrefKeys.lastStoreField));
  } catch {
    return '';
  }
}

export async function saveLastStoreField(value: string): Promise<void> {
  const clean = normalizeStoreField(value);
  if (!clean) return;
  await prefs.set(PrefKeys.lastStoreField, clean).catch(() => {});
}

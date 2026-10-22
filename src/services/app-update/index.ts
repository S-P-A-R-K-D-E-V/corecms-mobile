import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { createLogger } from '../logger';

const log = createLogger('app-update');

// ----------------------------------------------------------------------
// Bản cập nhật OTA (EAS Update). Trước đây tải xong là reloadAsync() ngay — người dùng đang ở trong app thì app tự khởi
// động lại, trông như bị crash (chủ báo 2026-10-19). Giờ:
//   - còn đang màn chờ (splash) mà đã tải xong → áp luôn, người dùng chỉ thấy màn chờ lâu hơn chút;
//   - đã vào app rồi mới tải xong → giữ lại, áp khi app xuống nền (lần mở sau là bản mới, không giật giữa chừng).
// ----------------------------------------------------------------------

/**
 * Nhãn bản cập nhật đang chạy, vd "cập nhật 22/10 14:28" (giờ máy) — để biết máy đã nhận OTA mới chưa khi thử. Bản
 * gốc trong cài đặt (chưa nhận OTA nào) / dev → null.
 */
export function runningUpdateLabel(
  createdAt: Date | null | undefined = Updates.createdAt,
  isEmbedded: boolean = Updates.isEmbeddedLaunch,
): string | null {
  if (!createdAt || isEmbedded) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `cập nhật ${p(createdAt.getDate())}/${p(createdAt.getMonth() + 1)} ${p(createdAt.getHours())}:${p(createdAt.getMinutes())}`;
}

/** Màn chờ chờ kết quả kiểm tra / tải bản cập nhật tối đa chừng này rồi vào app luôn. */
export const BOOT_UPDATE_WAIT_MS = 2500;

let uiShown = false;
let pendingReload = false;
let backgroundListening = false;

/** Gọi khi ẩn màn chờ — từ lúc này không khởi động lại giữa chừng nữa. */
export function markUiShown() {
  uiShown = true;
}

function applyWhenBackgrounded() {
  pendingReload = true;
  if (backgroundListening) return;
  backgroundListening = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'background' && pendingReload) {
      pendingReload = false;
      Updates.reloadAsync().catch((e) => log.warn('reload failed', e));
    }
  });
}

/**
 * Kiểm tra + tải bản cập nhật OTA. Xong trước khi ẩn màn chờ → áp ngay; xong sau → áp khi app xuống nền.
 * Không làm gì trong dev / Expo Go (Updates tắt).
 */
export async function checkForUpdate(): Promise<boolean> {
  if (__DEV__ || !Updates.isEnabled) return false;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return false;
    await Updates.fetchUpdateAsync();
    if (!uiShown) {
      await Updates.reloadAsync();
    } else {
      applyWhenBackgrounded();
    }
    return true;
  } catch (e) {
    log.warn('update check failed', e);
  }
  return false;
}

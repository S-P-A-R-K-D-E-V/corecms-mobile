import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

import { isMultiStore } from 'src/services/store-config';

// ----------------------------------------------------------------------
// Bắt buộc cập nhật: bản app cửa hàng cài thấp hơn MIN_STORE_APP_VERSION thì chỉ còn màn "Đã có phiên bản mới" (nút mở
// App Store / CH Play). Bản cũ vẫn nhận OTA (kênh store-production theo runtime = phiên bản app) nên màn chặn tới được
// cả bản cũ. Chủ 2026-10-21: đóng 1.0.2 + 1.0.3, ép nâng lên 1.0.4 (1.0.4 đã lên cả hai chợ ngày 19/10).
// Bản CiCi (không OTA, số phiên bản riêng) không áp.
// ----------------------------------------------------------------------

export const MIN_STORE_APP_VERSION = '1.0.4';

const IOS_APP_ID = '6818444586';
const ANDROID_PACKAGE = 'com.devbyspark.store';

/** So sánh "1.0.10" với "1.0.4" theo từng số (không theo chữ). Âm: a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Phiên bản app đang cài: runtime OTA (= phiên bản app của bản build); dev / Expo Go không có → null. */
export function installedAppVersion(): string | null {
  return Updates.runtimeVersion || Constants.expoConfig?.version || null;
}

export function isUpdateRequired(
  version: string | null = installedAppVersion(),
  storeVariant: boolean = isMultiStore,
  dev: boolean = __DEV__,
): boolean {
  if (dev || !storeVariant || !version) return false;
  return compareVersions(version, MIN_STORE_APP_VERSION) < 0;
}

/** Mở trang app trên chợ (app chợ trước, không mở được thì trang web). */
export async function openStoreListing(): Promise<void> {
  const native =
    Platform.OS === 'ios' ? `itms-apps://apps.apple.com/app/id${IOS_APP_ID}` : `market://details?id=${ANDROID_PACKAGE}`;
  const web =
    Platform.OS === 'ios'
      ? `https://apps.apple.com/app/id${IOS_APP_ID}`
      : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  try {
    await Linking.openURL(native);
  } catch {
    await Linking.openURL(web).catch(() => {});
  }
}

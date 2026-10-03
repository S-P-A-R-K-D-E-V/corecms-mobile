import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

import { useAuthContext } from 'src/auth/auth-context';
import { registerPushToken, unregisterPushToken } from 'src/api/notifications';
import { ACCESS_TOKEN_KEY } from 'src/api/session';
import { getStoreCode, onBeforeStoreChange } from 'src/services/store-config';

// ----------------------------------------------------------------------
// Token Expo theo cửa hàng: server lưu token cho cửa hàng ĐANG đăng nhập (POST /notifications/push-token tới API
// của cửa hàng đó, body { token, platform }).
//   - Đăng ký: mỗi lần vào một cửa hàng (đăng nhập, đổi cửa hàng) và mỗi lần mở app khi đã đăng nhập.
//   - Huỷ (DELETE /notifications/push-token, body { token }): trước khi đăng xuất / đổi cửa hàng / xoá tài khoản —
//     lúc token đăng nhập của cửa hàng đó còn dùng được. Lỗi không chặn đăng xuất / đổi cửa hàng.
//   - Mất phiên (server đã từ chối token): không gọi huỷ được — push cửa hàng cũ còn tới thì push-store báo
//     đúng tên cửa hàng, không mở theo link.
// ----------------------------------------------------------------------

const PUSH_TOKEN_KEY = 'expoPushToken';
/** Huỷ đăng ký không được giữ chân việc đổi cửa hàng quá lâu khi mạng chập chờn. */
const UNREGISTER_TIMEOUT_MS = 10_000;

async function getExpoPushToken(): Promise<string | null> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenData.data;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------

export function usePushRegistration() {
  const { user } = useAuthContext();
  // Đổi cửa hàng = đăng nhập cửa hàng khác: kể cả khi id người dùng trùng nhau, khoá đổi → đăng ký lại.
  const registrationKey = user ? `${getStoreCode() ?? 'app'}:${user.id}` : null;

  useEffect(() => {
    if (!registrationKey) return;
    let cancelled = false;

    // Android requires a notification channel
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'Thông báo chung',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00A76F',
      });
      Notifications.setNotificationChannelAsync('shift', {
        name: 'Ca làm việc',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 80, 40, 80],
        lightColor: '#00B8D9',
      });
      Notifications.setNotificationChannelAsync('attendance', {
        name: 'Chấm công',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#00A76F',
      });
      Notifications.setNotificationChannelAsync('payroll', {
        name: 'Bảng lương',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#22C55E',
      });
      Notifications.setNotificationChannelAsync('cleaning', {
        name: 'Vệ sinh',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#F59E0B',
      });
    }

    (async () => {
      const token = await getExpoPushToken();
      // Trong lúc chờ (hộp xin quyền) đã đăng xuất / đổi cửa hàng → lần chạy mới đăng ký đúng cửa hàng mới.
      if (!token || cancelled) return;

      // Lưu lại để huỷ đăng ký lúc đăng xuất / đổi cửa hàng.
      await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);

      try {
        await registerPushToken(token, Platform.OS);
      } catch {
        // Lỗi thì thôi — lần mở app / đăng nhập sau đăng ký lại.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [registrationKey]);
}

/**
 * Huỷ đăng ký token ở cửa hàng đang gắn (DELETE /notifications/push-token { token }) — gọi TRƯỚC khi xoá token
 * đăng nhập. Không còn token đăng nhập (đã mất phiên) thì server không nhận lệnh huỷ → bỏ qua. Không ném lỗi.
 */
export async function unregisterCurrentPushToken(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (!token) return;
    if (!(await SecureStore.getItemAsync(ACCESS_TOKEN_KEY))) return;
    await unregisterPushToken(token);
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch {}
}

function withTimeout(promise: Promise<unknown>, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Sang cửa hàng khác bằng mọi đường (chọn cửa hàng sau discover, nhập mã cửa hàng…): setStore xoá token của cửa
// hàng cũ → huỷ đăng ký push ở cửa hàng cũ ngay trước đó. Đăng xuất / "Đổi cửa hàng" đã huỷ trong logout().
onBeforeStoreChange(() => withTimeout(unregisterCurrentPushToken(), UNREGISTER_TIMEOUT_MS));

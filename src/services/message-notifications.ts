import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

import { useMessengerStore } from 'src/store/messenger-store';

// ----------------------------------------------------------------------
// Handler thông báo OS dùng chung toàn app (import side-effect ở src/app/_layout.tsx).
// Với thông báo tin nhắn (category "Messenger"), lọc khi đang foreground theo:
//   - tắt thông báo chung / tắt riêng "Tin nhắn"
//   - đang mở đúng hội thoại đó (không cần báo)
// Khi app nền/đóng, handler không chạy → OS tự hiển thị push (tắt hẳn vào Cài đặt hệ thống).
// ----------------------------------------------------------------------

const PREFS_KEY = 'notification_preferences';

let globalEnabled = true;
let messagesEnabled = true;

export function setMessageNotifyPrefs(p: { globalEnabled: boolean; messagesEnabled: boolean }) {
  globalEnabled = p.globalEnabled;
  messagesEnabled = p.messagesEnabled;
}

// Nạp sớm từ SecureStore để handler đúng ngay cả khi user chưa mở màn Cài đặt
(async () => {
  try {
    const stored = await SecureStore.getItemAsync(PREFS_KEY);
    if (!stored) return;
    const p = JSON.parse(stored);
    if (typeof p.globalEnabled === 'boolean') globalEnabled = p.globalEnabled;
    if (p.categories && typeof p.categories.Messages === 'boolean') messagesEnabled = p.categories.Messages;
  } catch {}
})();

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
    const isChat = data.category === 'Messenger' || data.type === 'Messenger';

    if (isChat) {
      const st = useMessengerStore.getState();
      const activeConv = st.activeConversationId;
      const suppress =
        !globalEnabled ||
        !messagesEnabled ||
        st.onMessagesScreen || // đang ở màn Tin nhắn → chỉ hiện thông báo trong app
        (!!activeConv && data.conversationId === activeConv);
      return {
        shouldShowBanner: !suppress,
        shouldShowList: !suppress,
        shouldPlaySound: !suppress,
        shouldSetBadge: true,
      };
    }

    return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true };
  },
});

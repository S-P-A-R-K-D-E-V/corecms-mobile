import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

import { useMessengerStore } from 'src/store/messenger-store';
import { getStoreCode } from 'src/services/store-config';
import { foreignStoreRepost, isStoreRepost } from 'src/services/push-store';

// ----------------------------------------------------------------------
// Handler thông báo OS dùng chung toàn app (import side-effect ở src/app/_layout.tsx).
// Với thông báo tin nhắn (category "Messenger"), lọc khi đang foreground theo:
//   - tắt thông báo chung / tắt riêng "Tin nhắn"
//   - đang mở đúng hội thoại đó (không cần báo)
// Push của cửa hàng khác (data.storeCode khác cửa hàng đang gắn — máy chưa kịp huỷ đăng ký ở cửa hàng cũ): handler
// không sửa được nội dung → ẩn bản gốc, hiện lại bản có tên cửa hàng đứng trước tiêu đề (push-store).
// Khi app nền/đóng, handler không chạy → OS tự hiển thị push nguyên bản (tắt hẳn vào Cài đặt hệ thống).
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

const HIDDEN: Notifications.NotificationBehavior = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
};

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const content = notification.request.content;
    const data = (content.data ?? {}) as Record<string, unknown>;
    const isChat = data.category === 'Messenger' || data.type === 'Messenger';

    // Cửa hàng khác → hiện lại một bản có tên cửa hàng (bản đó mang cờ, lần sau qua nhánh dưới), ẩn bản gốc.
    // Tin nhắn vẫn theo cài đặt thông báo và có tiếng như tin cùng cửa hàng; loại khác im lặng như cũ.
    const repost = foreignStoreRepost(content, getStoreCode());
    if (repost) {
      if (isChat && (!globalEnabled || !messagesEnabled)) return HIDDEN;
      Notifications.scheduleNotificationAsync({
        content: { title: repost.title, body: repost.body ?? undefined, data: repost.data, sound: isChat ? 'default' : undefined },
        trigger: null,
      }).catch(() => {});
      return HIDDEN;
    }
    if (isStoreRepost(data)) {
      return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: !!content.sound, shouldSetBadge: false };
    }

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

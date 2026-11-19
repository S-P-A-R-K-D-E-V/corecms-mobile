import { Stack } from 'expo-router';
import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { RoleGuard } from 'src/auth/role-guard';
import { PERMISSIONS } from 'src/auth/permissions';

// Hộp thư khách (Messenger + bình luận fanpage): danh sách /inbox, hội thoại /inbox/[id] — quyền conversation.read (trả lời
// theo conversation.reply trong màn). Guard ở layout nên mở thẳng từ thông báo (deep-link) cũng bị chặn khi thiếu quyền.
export default function InboxLayout() {
  return (
    <InternalAppGuard>
      <RoleGuard permissions={[PERMISSIONS.conversation.read]}>
        <Stack screenOptions={{ headerShown: false }} />
      </RoleGuard>
    </InternalAppGuard>
  );
}

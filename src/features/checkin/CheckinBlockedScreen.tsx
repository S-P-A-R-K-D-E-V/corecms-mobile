import { Screen, EmptyState } from 'src/components/shared';

// ----------------------------------------------------------------------
// Chủ cửa hàng tắt tự chấm công trên app với người này (Cài đặt cửa hàng → Tính năng web / app): báo thay vì để chụp ảnh
// rồi nhận 403.

export function CheckinBlockedScreen() {
  return (
    <Screen>
      <EmptyState
        icon="cellphone-off"
        title="Chấm công trên app đã tắt"
        description="Cửa hàng không cho bạn tự chấm công trên app. Hãy chấm công bằng máy chấm công tại cửa hàng hoặc hỏi quản lý."
      />
    </Screen>
  );
}

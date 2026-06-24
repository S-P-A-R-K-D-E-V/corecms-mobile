import { View } from 'react-native';
import { MotiView } from 'moti';

import { Text, Button } from '../ui';
import { ForbiddenIllustration } from '../ui/forbidden-illustration';
import { Screen } from './Screen';
import { spring } from 'src/theme/motion';

export type Forbidden403Props = {
  title?: string;
  description?: string;
  /** Nhãn nút chính (vd. "Quay lại" / "Về trang chủ"). */
  actionLabel?: string;
  onAction?: () => void;
  /** Hiện nút đăng xuất (dùng cho cổng chặn cấp app). */
  onLogout?: () => void;
};

/** Màn 403 toàn trang — hiển thị khi user không đủ quyền truy cập. */
export function Forbidden403({
  title = 'Không có quyền truy cập',
  description = 'Tài khoản của bạn không được cấp quyền sử dụng tính năng này.\nVui lòng liên hệ quản trị viên nếu cần hỗ trợ.',
  actionLabel,
  onAction,
  onLogout,
}: Forbidden403Props) {
  return (
    <Screen tabBarInset={false} edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-6 gap-4">
        <MotiView
          from={{ opacity: 0, scale: 0.85, translateY: 12 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: 'spring', ...spring.soft }}
        >
          <ForbiddenIllustration size={208} />
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 320, delay: 120 }}
          style={{ alignItems: 'center', gap: 8 }}
        >
          <Text variant="title2" className="text-center">{title}</Text>
          <Text tone="muted" className="text-center leading-5">{description}</Text>
        </MotiView>

        {(onAction || onLogout) ? (
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 320, delay: 240 }}
            style={{ width: '100%', maxWidth: 320, marginTop: 8, gap: 10 }}
          >
            {onAction && actionLabel ? (
              <Button onPress={onAction}>{actionLabel}</Button>
            ) : null}
            {onLogout ? (
              <Button variant="outline" action="error" icon="logout" onPress={onLogout}>
                Đăng xuất
              </Button>
            ) : null}
          </MotiView>
        ) : null}
      </View>
    </Screen>
  );
}

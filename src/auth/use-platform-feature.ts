import { useAuthContext } from './auth-context';
import { isPlatformFeatureBlocked } from './platform-features';

/**
 * Tính năng chưa bị chủ cửa hàng tắt trên app với người đang đăng nhập (GET /users/me → blockedFeatures). Dùng làm `enabled`
 * cho query để không gọi API của tính năng đã tắt (API trả 403 platform_feature_disabled).
 */
export function usePlatformFeatureAllowed(feature: string): boolean {
  const { user } = useAuthContext();
  return !isPlatformFeatureBlocked(user, feature);
}

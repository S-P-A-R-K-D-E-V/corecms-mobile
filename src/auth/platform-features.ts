import { Platform } from 'react-native';

// ----------------------------------------------------------------------
// Bật / tắt tính năng theo nền tảng — trùng Core-be (CoreCms.Domain/Common/PlatformFeatures.cs). Chủ cửa hàng giới hạn ai
// được dùng một tính năng trên web / app (cấu hình ở web: Cài đặt cửa hàng → Tính năng web / app). App khai nền tảng qua
// header X-Client-Platform (src/api/axios.ts); GET /users/me trả blockedFeatures cho nền tảng đó (máy quầy: không chặn gì).
// API vẫn tự chặn (403 platform_feature_disabled) — app chỉ ẩn cho khớp.
// ----------------------------------------------------------------------

export const CLIENT_PLATFORM_HEADER = 'X-Client-Platform';

/** "ios" / "android" (Core-be gộp thành "app"). */
export const CLIENT_PLATFORM: string = Platform.OS;

export const PLATFORM_FEATURES = {
  /** Tự chấm công vào / ra ca (GPS, khuôn mặt). Máy chấm công (kiosk) không bị ảnh hưởng. */
  selfCheckIn: 'attendance.self-checkin',
  /** Bán hàng: tạo hoá đơn, giỏ hàng chờ. */
  posSale: 'sales.pos',
  /** Kiểm quầy: thu chi trong ca, đếm tiền, chốt ca. */
  shiftCash: 'shift-cash.counter',
  /** Checklist vệ sinh của mình: hoàn thành việc, gửi ảnh. Không gồm chấm / phạt của quản lý. */
  cleaningTasks: 'cleaning.tasks',
  /** Báo cáo kinh doanh (/reports/*). */
  reports: 'analytics.reports',
} as const;

/** Mã lỗi Core-be trả khi tính năng bị tắt trên nền tảng này với người gọi. */
export const PLATFORM_FEATURE_DISABLED = 'platform_feature_disabled';

type UserWithBlocked = { blockedFeatures?: readonly string[] | null } | null | undefined;

export function isPlatformFeatureBlocked(user: UserWithBlocked, feature: string): boolean {
  return !!user?.blockedFeatures?.includes(feature);
}

/** Lỗi axios (AxiosError) hoặc body đã bóc: 403 { error: "platform_feature_disabled" }. */
export function isPlatformFeatureDisabledError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const body = (error as { response?: { data?: unknown } }).response?.data ?? error;
  return typeof body === 'object' && body !== null && (body as { error?: unknown }).error === PLATFORM_FEATURE_DISABLED;
}

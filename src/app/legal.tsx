import { LegalScreen } from 'src/features/settings/LegalScreen';

// Điều khoản / chính sách xem được cả khi chưa đăng nhập (màn Chào mừng) — /settings/* cần đăng nhập.
export default function Legal() {
  return <LegalScreen />;
}

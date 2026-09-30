import type { IUser } from 'src/types/corecms-api';
import { isMultiStore } from 'src/services/store-config';

// ----------------------------------------------------------------------

/** Field bắt buộc để dùng app: SĐT, địa chỉ, ngân hàng (mã + số TK), CCCD (trước + sau). */
export function getMissingProfileFields(user: Pick<IUser, 'phoneNumber' | 'address' | 'bankCode' | 'bankNo' | 'idCardFrontUrl' | 'idCardBackUrl'>) {
  return {
    phone: !user.phoneNumber?.trim(),
    address: !user.address?.trim(),
    bank: !user.bankCode?.trim() || !user.bankNo?.trim(),
    idCardFront: !user.idCardFrontUrl,
    idCardBack: !user.idCardBackUrl,
  };
}

export function isProfileComplete(user: Pick<IUser, 'phoneNumber' | 'address' | 'bankCode' | 'bankNo' | 'idCardFrontUrl' | 'idCardBackUrl'> | null | undefined): boolean {
  if (!user) return true; // chưa có user (chưa đăng nhập) — không phải lỗi thiếu hồ sơ
  // Bản cửa hàng (toàn cầu): không chặn app đòi CCCD + tài khoản ngân hàng VietQR — người ngoài Việt Nam
  // không có, và App Store (5.1.1) không cho bắt buộc dữ liệu không cần cho chức năng chính (người duyệt
  // dùng cửa hàng demo sẽ bị kẹt). Vẫn điền được ở Hồ sơ → Chỉnh sửa. Bắt buộc theo từng cửa hàng: để sau.
  if (isMultiStore) return true;
  const m = getMissingProfileFields(user);
  return !m.phone && !m.address && !m.bank && !m.idCardFront && !m.idCardBack;
}

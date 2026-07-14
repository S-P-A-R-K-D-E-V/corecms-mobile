import type { IUser } from 'src/types/corecms-api';

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
  const m = getMissingProfileFields(user);
  return !m.phone && !m.address && !m.bank && !m.idCardFront && !m.idCardBack;
}

import type { IVietQRBank } from 'src/types/corecms-api';

// ----------------------------------------------------------------------

/** Danh sách ngân hàng chuẩn VietQR — gọi thẳng API public, không qua backend
 *  (giống hệt cách core-fe làm ở src/api/bank-accounts.ts). */
export async function getVietQRBanks(): Promise<IVietQRBank[]> {
  const res = await fetch('https://api.vietqr.io/v2/banks');
  const json = await res.json();
  if (json.code === '00') return json.data;
  return [];
}

import { submitSale, type SaleHttpResult } from 'src/api/erp';

import { useCart } from './cart-store';
import { SALE_TIMEOUT_MS, readSaleAttempt, type SaleAttempt, type SaleDraft, type SaleRequest } from './sale-request';

type Send = (request: SaleRequest, timeoutMs: number) => Promise<SaleHttpResult>;

/**
 * Gửi một lần bán và ghi kết quả vào giỏ (không phụ thuộc màn hình còn mở hay không):
 *   - `draft`: lần bán mới từ giỏ hiện tại; `'recheck'`: gửi lại đúng gói đang treo ("đang kiểm tra hoá đơn").
 *   - đã tạo → giỏ được xoá; bị từ chối → giỏ mở lại để sửa; chưa biết kết quả → giỏ khoá, chờ kiểm tra lại.
 * Mã chống trùng được ghi xuống máy trước khi gửi (cart-store.beginSale) và giữ nguyên qua mọi lần gửi lại.
 */
export async function sendSale(draft: SaleDraft | 'recheck', send: Send = submitSale): Promise<SaleAttempt> {
  const cart = useCart.getState();
  const request = draft === 'recheck' ? await cart.retrySale() : await cart.beginSale(draft);
  // Không còn lần bán nào đang treo (đã có kết quả / đã bỏ kiểm tra) → không gửi gì.
  if (!request) return { kind: 'rejected', error: undefined };

  let attempt: SaleAttempt;
  try {
    attempt = readSaleAttempt(await send(request, SALE_TIMEOUT_MS));
  } catch {
    attempt = { kind: 'unknown' };
  }
  useCart.getState().settleSale(request.clientRequestId, attempt.kind);
  return attempt;
}

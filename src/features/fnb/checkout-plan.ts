import type { PaymentState } from 'src/features/pos/PaymentPanel';

import type { CheckoutPayment } from './fnb-commands';

// ----------------------------------------------------------------------
// Thanh toán đơn F&B từ trạng thái của PaymentPanel (dùng chung với Bán hàng): một phương thức trả đủ tổng tiền.
//   - Σ payments = tổng đơn; tổng 0 → payments rỗng (contract 5.13).
//   - Tiền mặt: `cashTendered` = tiền khách đưa khi lớn hơn tổng; đưa vừa đủ → null (máy chủ hiểu là vừa đủ).
//   - Chuyển khoản: `bankAccountId` = id dòng GET /bank-accounts + nội dung chuyển khoản.
// ----------------------------------------------------------------------

export type CheckoutPlan = { payments: CheckoutPayment[]; cashTendered: number | null };

export function checkoutPlan(total: number, payment: Pick<PaymentState, 'method' | 'account' | 'transferRef' | 'cashGiven'>): CheckoutPlan {
  if (total <= 0) return { payments: [], cashTendered: null };
  const transfer = payment.method === 'Transfer';
  const given = payment.cashGiven ?? total;
  return {
    payments: [
      {
        method: payment.method,
        amount: total,
        bankAccountId: transfer ? payment.account?.id ?? null : null,
        transactionRef: transfer ? payment.transferRef?.trim() || null : null,
      },
    ],
    cashTendered: payment.method === 'Cash' && given > total ? given : null,
  };
}

import type { IKitchenTicket, IOpenOrder } from 'src/types/fnb';

// ----------------------------------------------------------------------
// ĐIỂM GỌI IN DUY NHẤT của F&B. Mọi thứ cần in (phiếu bar, phiếu huỷ, tạm tính, phiếu thanh toán) đều gọi
// printFnbDocument() — không nơi nào khác được gọi máy in.
//
// CHƯA LÀM IN ẤN: hàm trả 'Skipped' = "máy này chưa cấu hình máy in" (contract 6.1 bước 5). Kết quả của phiếu
// bar được báo lên máy chủ (POST /fnb/kitchen-tickets/{id}/print-result) nên các máy khác không hiện cảnh báo
// "phiếu chưa in". Khi làm in thật: nối máy in ở đây và trả 'Printed' / 'Failed' (kèm lỗi).
// ----------------------------------------------------------------------

export type FnbPrintJob =
  /** Phiếu bar (kind Order) hoặc phiếu "HỦY" (kind Void). `reprint` = in lại ("IN LẠI"). */
  | { kind: 'kitchenTicket'; ticket: IKitchenTicket; reprint?: boolean }
  /** "TẠM TÍNH" — in từ đơn trả về sau POST /bill. */
  | { kind: 'provisionalBill'; order: IOpenOrder }
  /** "PHIẾU THANH TOÁN" — in từ đơn đã Paid (payment.salesOrderCode, dòng, tổng, tiền thừa). */
  | { kind: 'receipt'; order: IOpenOrder };

export type FnbPrintResult = { result: 'Printed' | 'Failed' | 'Skipped'; error?: string | null };

export async function printFnbDocument(_job: FnbPrintJob): Promise<FnbPrintResult> {
  return { result: 'Skipped' };
}

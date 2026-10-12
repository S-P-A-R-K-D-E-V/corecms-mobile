// ----------------------------------------------------------------------
// Kiểu dữ liệu F&B (gọi món tại bàn, trả sau) — khớp "F&B POS API contract v1" của core-be (/fnb/*).
// Tiền là số nguyên đồng (Dong), thời điểm là ISO-8601 UTC có "Z", mọi id là uuid dạng chuỗi.
// Máy chủ có thể thêm giá trị enum / cờ mới: phía app coi giá trị lạ là "khác" chứ không lỗi.
// ----------------------------------------------------------------------

/** Giá trị enum của máy chủ — giữ gợi ý các giá trị đã biết nhưng vẫn nhận chuỗi lạ. */
type Open<T extends string> = T | (string & {});

export type FnbOrderStatus = Open<'Open' | 'Paid' | 'Cancelled' | 'Moved'>;
export type FnbLineStatus = Open<'Pending' | 'Sent' | 'Voided' | 'Removed'>;
export type FnbLineType = Open<'Item' | 'OpenItem'>;
export type FnbServiceType = Open<'DineIn' | 'Takeaway'>;
export type FnbPaymentMethod = 'Cash' | 'Transfer' | 'Card';
export type FnbPrintStatus = Open<'Pending' | 'Printed' | 'Failed' | 'Skipped'>;

export interface ILineTopping {
  productId: string;
  name: string;
  /** Số phần cho MỘT đơn vị món (1..20). */
  quantity: number;
  unitPrice: number;
}

export interface IOrderLine {
  id: string;
  /** Thứ tự hiển thị trong đơn do máy chủ cấp. */
  seq: number;
  status: FnbLineStatus;
  /** OpenItem = món ngoài thực đơn (tên + giá tự nhập). */
  lineType: FnbLineType;
  productId: string;
  dishId: string | null;
  name: string;
  variantName: string | null;
  /** Số lượng còn tính tiền. */
  quantity: number;
  orderedQuantity: number;
  voidedQuantity: number;
  listPrice: number;
  /** Giá một đơn vị, chưa gồm món thêm. */
  unitPrice: number;
  priceOverride: { reason: string; byName: string; at: string } | null;
  toppings: ILineTopping[];
  quickNotes: string[];
  note: string | null;
  /** quantity × (unitPrice + Σ topping.quantity × topping.unitPrice) — máy chủ tính. */
  amount: number;
  /** Phiếu bar đã gửi dòng này. */
  ticketId: string | null;
  sentAt: string | null;
  movedFromOrderId: string | null;
  movedFromLineId: string | null;
  createdAt: string;
  createdByName: string;
  flags: string[];
  /** Dòng combo: các món thành phần đã chọn (rỗng / thiếu với món thường). Huỷ / chuyển đi cả combo. */
  components?: ILineComponent[];
}

/** Thành phần đã chọn của dòng combo; `quantity` là số lượng cho MỖI combo. */
export interface ILineComponent {
  groupId: string;
  groupName: string;
  productId: string;
  name: string;
  variantName: string | null;
  quantity: number;
  listPrice: number;
  surcharge: number;
}

export interface IOrderDiscount {
  type: Open<'Percent' | 'Amount'>;
  value: number;
  reason: string;
  byName: string;
  at: string;
}

export interface IOrderPaymentPart {
  method: FnbPaymentMethod;
  amount: number;
  bankAccountId: string | null;
  transactionRef: string | null;
}

export interface IOrderPayment {
  salesOrderId: string;
  salesOrderCode: string;
  paidAt: string;
  paidByName: string;
  payments: IOrderPaymentPart[];
  cashTendered: number | null;
  changeDue: number;
}

export interface IOrderTotals {
  itemCount: number;
  subtotal: number;
  discountAmount: number;
  total: number;
}

export interface IOrderBill {
  firstPrintedAt: string;
  lastPrintedAt: string;
  printCount: number;
  lastTotal: number;
  lastByName: string;
}

/** Đơn mở (một bàn hoặc mang về). `version` tăng 1 sau mỗi lệnh đã áp dụng. */
export interface IOpenOrder {
  id: string;
  version: number;
  status: FnbOrderStatus;
  branchId: string;
  /** null = mang về. */
  tableId: string | null;
  tableName: string | null;
  areaName: string | null;
  serviceType: FnbServiceType;
  orderNo: number;
  /** Số in trên phiếu bar và tạm tính. */
  displayNo: string;
  guestCount: number | null;
  customerId: string | null;
  customerName: string | null;
  note: string | null;
  /** Mọi dòng kể cả Voided / Removed, xếp theo seq. */
  lines: IOrderLine[];
  discount: IOrderDiscount | null;
  totals: IOrderTotals;
  bill: IOrderBill | null;
  /** true khi đã in tạm tính (hoặc theo chính sách cửa hàng): huỷ món đã gửi cần quản lý. */
  voidRequiresManager: boolean;
  payment: IOrderPayment | null;
  movedToOrderId: string | null;
  cancelReason: string | null;
  reviewFlags: string[];
  openedAt: string;
  openedByName: string;
  updatedAt: string;
  closedAt: string | null;
  closedByName: string | null;
}

export interface IOrderSummary {
  id: string;
  version: number;
  status: FnbOrderStatus;
  branchId: string;
  tableId: string | null;
  displayNo: string;
  guestCount: number | null;
  itemCount: number;
  pendingLineCount: number;
  total: number;
  billPrinted: boolean;
  openedAt: string;
  updatedAt: string;
  openedByName: string;
}

export interface IKitchenTicketLine {
  lineId: string;
  name: string;
  variantName: string | null;
  quantity: number;
  toppings: { name: string; quantity: number }[];
  quickNotes: string[];
  note: string | null;
  /** Dòng combo: các món quầy bar phải làm, số lượng cho MỖI combo. */
  components?: { name: string; variantName: string | null; quantity: number }[];
}

/** Phiếu bar: nội dung chụp lúc tạo (không đổi) + trạng thái in (đổi được). */
export interface IKitchenTicket {
  id: string;
  kind: Open<'Order' | 'Void'>;
  branchId: string;
  orderId: string;
  station: string;
  /** 1,2,3… theo đơn với phiếu Order; null với phiếu Void. */
  roundNo: number | null;
  displayNo: string;
  tableName: string | null;
  areaName: string | null;
  serviceType: FnbServiceType;
  createdAt: string;
  createdByName: string;
  voidReason: string | null;
  lines: IKitchenTicketLine[];
  printStatus: FnbPrintStatus;
  printAttempts: number;
  printedAt: string | null;
  printedByDeviceId: string | null;
  printedByDeviceName: string | null;
  lastPrintError: string | null;
  reprintCount: number;
  claimedByDeviceId: string | null;
  claimExpiresAt: string | null;
  updatedAt: string;
}

/** Kết quả của mọi lệnh trên đơn. */
export interface IOrderCommandResult {
  order: IOpenOrder;
  replayed: boolean;
  /** Phiếu bar do lệnh này tạo, không có thì null. */
  ticket: IKitchenTicket | null;
  /** Lệnh chuyển món: đơn đích. */
  otherOrder: IOpenOrder | null;
}

export interface ITicketCommandResult {
  ticket: IKitchenTicket;
  replayed: boolean;
}

// ── Thực đơn ────────────────────────────────────────────────────────────

export interface IMenuCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface IMenuVariant {
  /** Dòng bán được: id size, hoặc chính id món khi món không có size. */
  productId: string;
  /** null khi món không có size. */
  name: string | null;
  price: number;
  isSoldOut: boolean;
  sortOrder: number;
}

/** Mỗi nhóm chọn đúng một lựa chọn (nhóm một lựa chọn = thành phần cố định); lựa chọn đầu là mặc định. */
export interface IMenuCombo {
  groups: IMenuComboGroup[];
}

export interface IMenuComboGroup {
  id: string;
  name: string;
  sortOrder: number;
  options: IMenuComboOption[];
}

export interface IMenuComboOption {
  /** Dòng bán được của món thành phần (size hoặc chính món). */
  productId: string;
  dishId: string;
  name: string;
  variantName: string | null;
  /** Số lượng cho MỖI combo. */
  quantity: number;
  /** Giá bán lẻ của món thành phần. */
  price: number;
  /** Phụ thu cộng vào giá combo khi chọn. */
  surcharge: number;
  isSoldOut: boolean;
  sortOrder: number;
}

export interface IMenuDish {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  imageUrl: string | null;
  sortOrder: number;
  isSoldOut: boolean;
  priceFrom: number;
  /** Luôn có ít nhất một phần tử. */
  variants: IMenuVariant[];
  /** Món thêm được phép của món này, theo thứ tự hiển thị. */
  toppingIds: string[];
  /** Món là combo: các nhóm thành phần; null / thiếu = món thường. Combo không có size và không nhận món thêm. */
  combo?: IMenuCombo | null;
}

export interface IMenuTopping {
  productId: string;
  name: string;
  price: number;
  isSoldOut: boolean;
  sortOrder: number;
}

export interface IQuickNote {
  id: string;
  text: string;
  /** [] = dùng cho mọi món. */
  categoryIds: string[];
  sortOrder: number;
}

/** GET /fnb/menu — một gói cho một chi nhánh; app lưu xuống máy và tự lọc. */
export interface IFnbMenu {
  branchId: string;
  menuVersion: string;
  generatedAt: string;
  categories: IMenuCategory[];
  dishes: IMenuDish[];
  toppings: IMenuTopping[];
  quickNotes: IQuickNote[];
}

// ── Sơ đồ bàn ───────────────────────────────────────────────────────────

export interface IFloorTable {
  id: string;
  name: string;
  seats: number | null;
  sortOrder: number;
  isActive: boolean;
  /** Các đơn đang mở tại bàn (bàn có thể có nhiều đơn sau khi tách). */
  orders: IOrderSummary[];
}

export interface IFloorArea {
  id: string;
  name: string;
  sortOrder: number;
  tables: IFloorTable[];
}

export interface IUnprintedTicket {
  id: string;
  orderId: string;
  kind: string;
  printStatus: FnbPrintStatus;
  createdAt: string;
  claimExpiresAt: string | null;
}

/** GET /fnb/floor — ảnh chụp sơ đồ bàn của một chi nhánh. */
export interface IFnbFloor {
  branchId: string;
  serverTime: string;
  /** Mốc để hỏi tiếp GET /fnb/sync. */
  cursor: string;
  menuVersion: string;
  tablesVersion: string;
  areas: IFloorArea[];
  takeawayOrders: IOrderSummary[];
  unprintedTickets: IUnprintedTicket[];
}

/** GET /fnb/sync — các đơn và phiếu đổi từ `cursor` (giao ít nhất một lần, có thể lặp). */
export interface IFnbSync {
  cursor: string;
  serverTime: string;
  menuVersion: string;
  tablesVersion: string;
  capabilities?: { offlineReplay?: boolean } | null;
  orders: IOpenOrder[];
  tickets: IKitchenTicket[];
  hasMore: boolean;
}

// ── Kho nguyên liệu trên app: pha mẻ bán thành phẩm ─────────────────────

export interface IFnbBatchRecipeLine {
  ingredientId: string;
  /** Lượng cho MỘT mẻ, đơn vị gốc của nguyên liệu. */
  quantity: number;
}

export interface IFnbBatchRecipeItem {
  productId: string;
  code: string;
  name: string;
  unit: string | null;
  onHand: number;
  /** Sản lượng một mẻ (đơn vị gốc); null = chưa có công thức mẻ. */
  yieldQuantity: number | null;
  /** Hạn của lô pha = ngày pha + số ngày này; null = không ghi hạn. */
  shelfLifeDays: number | null;
  note: string | null;
  lines: IFnbBatchRecipeLine[];
}

export interface IFnbIngredientOption {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  onHand: number;
}

export interface IFnbBatchRecipeBook {
  items: IFnbBatchRecipeItem[];
  ingredients: IFnbIngredientOption[];
}

/** Phiếu pha mẻ vừa lập (phần app dùng). */
export interface IFnbBatch {
  id: string;
  code: string;
  productName: string;
  unit: string | null;
  batchCount: number;
  actualYield: number;
  expiryDate: string | null;
  status: 'Completed' | 'Cancelled';
}

// ── Kho nguyên liệu trên app: xuất huỷ ──────────────────────────────────

/** Đơn vị quy đổi của một hàng (đơn vị mua): 1 đơn vị = `factor` đơn vị gốc. */
export interface IFnbUnitOption {
  unitId: string;
  name: string;
  factor: number;
}

/** Nguyên liệu trong báo cáo tồn của chi nhánh (phần app dùng). */
export interface IFnbStockIngredient {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  onHand: number;
  units?: IFnbUnitOption[];
}

export interface IFnbStockReport {
  ingredients: IFnbStockIngredient[];
}

export type FnbDisposalReason = 'Expired' | 'Damaged' | 'Spilled' | 'BadMake' | 'Other';

/** Phiếu xuất huỷ vừa lập (phần app dùng). Pending = chờ quản lý duyệt; Completed = đã trừ kho. */
export interface IFnbDisposal {
  id: string;
  code: string;
  status: 'Draft' | 'Pending' | 'Completed' | 'Cancelled';
}

// ── Kho nguyên liệu trên app: kiểm kho ──────────────────────────────────

export interface IFnbStockCountLine {
  lineId: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string | null;
  units: IFnbUnitOption[];
  isCounted: boolean;
  /** Số đã đếm theo đơn vị gốc. */
  countedQuantity: number | null;
  /** Số hệ thống lúc đếm — null khi đếm mù (nhân viên). */
  systemQuantity?: number | null;
}

/** Phiếu kiểm kho (phần app dùng). Draft = đang đếm; Pending = đã nộp, chờ quản lý duyệt. */
export interface IFnbStockCount {
  id: string;
  code: string;
  status: 'Draft' | 'Pending' | 'Completed' | 'Cancelled';
  blind?: boolean;
  totalLines?: number;
  countedLines?: number;
  /** Có ở phiếu đọc chi tiết; danh sách phiếu thì null. */
  lines: IFnbStockCountLine[] | null;
}

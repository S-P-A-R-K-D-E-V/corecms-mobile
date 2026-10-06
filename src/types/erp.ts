// ----------------------------------------------------------------------
// Kiểu dữ liệu ERP (hàng hoá, hoá đơn, nhập hàng) — khớp record response của core-be
// (CoreCms.Contracts: Inventory/Sales/Purchasing). Dữ liệu dạng KiotViet: CiCi đồng bộ từ KiotViet.
// ----------------------------------------------------------------------

export interface IPaged<T> {
  items: T[];
  totalCount: number;
  page?: number;
  pageSize?: number;
}

export interface IProductInventory {
  id: string;
  productId: string;
  branchId?: number | null;
  branchName?: string | null;
  onHand?: number | null;
  reserved: number;
  /** Giá vốn — chỉ hiện cho chủ/quản lý. */
  cost?: number | null;
}

export interface IProductAttribute {
  id: string;
  attributeName: string;
  attributeValue: string;
}

export interface IProductChild {
  id: string;
  code: string;
  name: string;
  fullName?: string | null;
  barCode?: string | null;
  basePrice: number;
  conversionValue?: number | null;
  isActive: boolean;
  inventories?: IProductInventory[] | null;
  attributes?: IProductAttribute[] | null;
}

/** 1 combo, 2 hàng hoá thường, 3 dịch vụ. */
export type ProductType = 1 | 2 | 3;

export interface IProductListItem {
  id: string;
  kiotVietId?: number | null;
  code: string;
  name: string;
  fullName?: string | null;
  barCode?: string | null;
  categoryName: string;
  hasVariants: boolean;
  basePrice: number;
  productType: ProductType;
  isActive: boolean;
  tradeMarkName?: string | null;
  minQuantity: number;
  maxQuantity: number;
  inventories?: IProductInventory[] | null;
  childProducts?: IProductChild[] | null;
  coverImageUrl?: string | null;
}

export interface IProductDetail extends Omit<IProductListItem, 'coverImageUrl'> {
  description?: string | null;
  categoryId: string;
  allowsSale: boolean;
  unit?: string | null;
  images?: { id: string; imageUrl: string; sortOrder: number }[] | null;
  attributes?: IProductAttribute[] | null;
}

/** Nhóm hàng — khớp CategoryResponse của core-be. GET /categories trả danh sách phẳng (có cả nhóm con). */
export interface ICategory {
  id: string;
  name: string;
  parentCategoryId?: string | null;
  parentCategoryName?: string | null;
  hasChild?: boolean;
  isActive: boolean;
  subCategories?: ICategory[] | null;
}

export interface IWarehouse {
  id: string;
  name: string;
  address?: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface IBankAccount {
  id: string;
  /** Id tài khoản bên KiotViet — gửi kèm thanh toán chuyển khoản. */
  kiotVietId?: number | null;
  bankName?: string | null;
  shortName?: string | null;
  code?: string | null;
  bin?: string | null;
  accountNumber?: string | null;
  description?: string | null;
}

// ── Hoá đơn ─────────────────────────────────────────────────────────────

export interface ISalesOrderItem {
  id: string;
  productId: string;
  productName: string;
  productSKU?: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  totalPrice: number;
}

export interface ISalesOrderPayment {
  id: string;
  method: string;
  amount: number;
  transactionRef?: string | null;
  createdAt?: string | null;
}

export interface ISalesOrder {
  id: string;
  orderNumber: string;
  customerId?: string | null;
  customerName?: string | null;
  warehouseName: string;
  /** "Hoàn thành" / "Đã hủy" (KiotViet) hoặc Completed/Cancelled. */
  status: string;
  paymentStatus: 'Paid' | 'PartiallyPaid' | 'Pending' | string;
  subTotal: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  note?: string | null;
  /** Người bán (SoldByName). */
  createdByName: string;
  createdAt: string;
  items: ISalesOrderItem[];
  payments: ISalesOrderPayment[];
  /** Trạng thái đẩy sang KiotViet của đơn tạo trên app/web — xem KiotVietSyncStatus. */
  kiotVietSyncStatus?: KiotVietSyncStatus | string | null;
  /** Lý do đẩy lỗi (Failed); NotPushed luôn null. */
  kiotVietSyncError?: string | null;
  kiotVietOrderCode?: string | null;
}

/**
 * None: đơn đồng bộ từ KiotViet về (hoặc đơn đang chờ đẩy / đẩy lỗi đã huỷ) · Pending: chờ đẩy sang KiotViet
 * · Pushing: đang đẩy · Synced: KiotViet đã nhận · Failed: đẩy lỗi (kiotVietSyncError)
 * · NotPushed: chỉ lưu trong hệ thống, không đẩy KiotViet — trạng thái bình thường, không phải lỗi (cửa hàng
 * không nối KiotViet, hoặc core-be đang tắt đẩy hoá đơn); huỷ đơn vẫn giữ NotPushed.
 */
export type KiotVietSyncStatus = 'None' | 'Pending' | 'Pushing' | 'Synced' | 'Failed' | 'NotPushed';

export interface IPagedSalesOrders {
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  items: ISalesOrder[];
}

export type PaymentMethod = 'Cash' | 'Transfer' | 'Card';

export interface ICreateSalePayment {
  method: PaymentMethod;
  amount: number;
  /** KiotViet bank account id (chuyển khoản). */
  accountId?: number;
  transactionRef?: string;
}

export interface ICreateSaleRequest {
  totalPayment: number;
  method: PaymentMethod;
  warehouseId?: string;
  /** Id (Guid) chi nhánh đang làm việc. core-be cũ bỏ qua trường lạ; bản mới ghi hoá đơn vào chi nhánh này. */
  branchRefId?: string;
  /** uuid của lần bán — gửi lại (hết giờ, mất mạng, app bị tắt) dùng lại id để core-be không tạo 2 hoá đơn. */
  clientRequestId?: string;
  note?: string;
  soldByName?: string;
  invoiceDetails: {
    productId: string;
    productVariantId?: string;
    productCode?: string;
    productName: string;
    quantity: number;
    price: number;
  }[];
  payments: ICreateSalePayment[];
}

/** POST /sales-orders. core-be cũ chỉ trả `id`; bản mới kèm trạng thái đẩy KiotViet (Pending | NotPushed). */
export interface ICreateSaleResponse {
  id: string;
  kiotVietSyncStatus?: KiotVietSyncStatus | string | null;
}

// ── Chỉnh tồn kho (chủ cửa hàng) ────────────────────────────────────────

/** Set = đặt đúng số đếm được; Delta = cộng/trừ một lượng. */
export type StockAdjustmentMode = 'Set' | 'Delta';

/** Kiểm kê / Hư hỏng / Nhập thiếu / Khác. */
export type StockAdjustmentReason = 'Count' | 'Damaged' | 'Missing' | 'Other';

/**
 * Pending/Pushing: đang chờ đẩy sang KiotViet · Synced: KiotViet đã nhận · Failed: đẩy lỗi (thử lại được)
 * · Local: cửa hàng không nối KiotViet — tồn đã đổi ngay trong core.
 */
export type StockAdjustmentStatus = 'Pending' | 'Pushing' | 'Synced' | 'Failed' | 'Local';

/** POST /products/{id}/stock-adjustments — id là hàng thường hoặc 1 biến thể (không phải hàng gộp biến thể). */
export interface ICreateStockAdjustmentRequest {
  /** Id chi nhánh KiotViet (inventories[].branchId). */
  branchId: number;
  mode: StockAdjustmentMode;
  /** Set: số đếm được (≥ 0). Delta: lượng cộng (+) / trừ (−), khác 0. */
  quantity: number;
  reason: StockAdjustmentReason;
  note?: string;
  /** uuid cho mỗi lần gửi — gửi lại cùng nội dung (mạng chập chờn) dùng lại id để BE không tạo 2 lần. */
  clientRequestId: string;
}

export interface IStockAdjustment {
  id: string;
  branchId: number;
  branchName?: string | null;
  mode: StockAdjustmentMode;
  quantity: number;
  reason: StockAdjustmentReason | string;
  note?: string | null;
  /** Tồn trong core lúc tạo phiếu. */
  localOnHandBefore?: number | null;
  /** Tồn đích (Delta: tính trên tồn KiotViet lúc đẩy). */
  targetOnHand?: number | null;
  /** Tồn KiotViet trả về sau khi nhận. */
  kvOnHandAfter?: number | null;
  status: StockAdjustmentStatus | string;
  error?: string | null;
  createdAt: string;
  createdByName?: string | null;
}

// ── Nhập hàng ───────────────────────────────────────────────────────────

/** Draft, Confirmed, PartiallyReceived, Completed, Cancelled, Returned ("Đã trả" — đơn KiotViet). */
export type PurchaseOrderStatus = 'Draft' | 'Confirmed' | 'PartiallyReceived' | 'Completed' | 'Cancelled' | 'Returned';

export interface IPurchaseOrderItem {
  id: string;
  productId?: string | null;
  productName: string;
  productCode: string;
  quantity: number;
  receivedQuantity: number;
  unitPrice: number;
  discountAmount: number;
  totalPrice: number;
  note?: string | null;
}

export interface IPurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId?: string | null;
  supplierName: string;
  warehouseId?: string | null;
  warehouseName: string;
  status: PurchaseOrderStatus | string;
  subTotal: number;
  discountAmount: number;
  totalAmount: number;
  note?: string | null;
  expectedDate?: string | null;
  receivedDate?: string | null;
  createdByName: string;
  paidByShareholderName?: string | null;
  createdAt: string;
  items: IPurchaseOrderItem[];
}

export interface IPagedPurchaseOrders {
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  items: IPurchaseOrder[];
}

export interface ISupplier {
  id: string;
  code?: string | null;
  name: string;
  contactNumber?: string | null;
  isActive: boolean;
}

export interface ICreatePurchaseOrderRequest {
  supplierId: string;
  warehouseId: string;
  note?: string;
  expectedDate?: string;
  discountAmount: number;
  items: { productId: string; quantity: number; unitPrice: number; vatRate: number; discountAmount: number; note?: string }[];
}

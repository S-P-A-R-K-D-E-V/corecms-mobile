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
  /** Đơn tạo trên app/web đẩy sang KiotViet: None|Pending|Pushing|Synced|Failed. */
  kiotVietSyncStatus?: string | null;
  kiotVietSyncError?: string | null;
  kiotVietOrderCode?: string | null;
}

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

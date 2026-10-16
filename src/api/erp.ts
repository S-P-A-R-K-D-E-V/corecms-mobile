import axios, { endpoints } from './axios';
import type {
  IBankAccount,
  ICategory,
  ICreatePurchaseOrderRequest,
  ICreateSaleRequest,
  ICreateStockAdjustmentRequest,
  IPaged,
  IPagedPurchaseOrders,
  IPagedSalesOrders,
  IProductChild,
  IProductDetail,
  IProductListItem,
  IPurchaseOrder,
  ISalesOrder,
  IStockAdjustment,
  ISupplier,
  IWarehouse,
  StockAdjustmentStatus,
} from 'src/types/erp';

// ----------------------------------------------------------------------
// ERP trên app (core-be: Products / SalesOrders / PurchaseOrders / Warehouses / Suppliers / BankAccounts).
// ----------------------------------------------------------------------

/** `categoryId`: core-be lọc đúng nhóm đó (không gộp hàng của nhóm con). */
export async function getProducts(params: {
  keyword?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}): Promise<IPaged<IProductListItem>> {
  const res = await axios.get<IPaged<IProductListItem>>(endpoints.products.list, {
    params: {
      isActive: true,
      page: 1,
      pageSize: 30,
      ...params,
      keyword: params.keyword?.trim() || undefined,
      categoryId: params.categoryId || undefined,
    },
  });
  return res.data;
}

/** Nhóm hàng của cửa hàng — danh sách phẳng, có cả nhóm con và nhóm đã ẩn (isActive = false). */
export async function getCategories(): Promise<ICategory[]> {
  const res = await axios.get<ICategory[]>(endpoints.categories.list);
  return res.data ?? [];
}

export async function getProduct(id: string): Promise<IProductDetail> {
  const res = await axios.get<IProductDetail>(endpoints.products.details(id));
  return res.data;
}

export async function getProductChildren(id: string): Promise<IProductChild[]> {
  const res = await axios.get<IProductChild[]>(endpoints.products.children(id));
  return res.data;
}

// ── Chỉnh tồn kho ───────────────────────────────────────────────────────

/**
 * Sửa tồn 1 hàng tại 1 chi nhánh (chỉ chủ cửa hàng). Cửa hàng nối KiotViet: BE xếp hàng đẩy sang KiotViet
 * (202, Pending) — tồn trên app chỉ đổi khi KiotViet nhận; chưa bật đẩy tồn thì 409 StockAdjustment.PushDisabled.
 * Cửa hàng không nối KiotViet: đổi ngay (Local).
 */
export async function createStockAdjustment(
  productId: string,
  data: ICreateStockAdjustmentRequest
): Promise<{ id: string; status: StockAdjustmentStatus }> {
  const res = await axios.post<{ id: string; status: StockAdjustmentStatus }>(endpoints.products.stockAdjustments(productId), data);
  return res.data;
}

/** Các lần chỉnh tồn của 1 hàng (chủ cửa hàng + quản lý). */
export async function getStockAdjustments(productId: string): Promise<IStockAdjustment[]> {
  const res = await axios.get<IStockAdjustment[]>(endpoints.products.stockAdjustments(productId));
  return res.data ?? [];
}

/** Đẩy lại lần chỉnh tồn bị lỗi sang KiotViet (chỉ chủ cửa hàng). */
export async function retryStockAdjustment(id: string): Promise<void> {
  await axios.post(endpoints.kiotViet.retryStockAdjustment(id));
}

export async function getWarehouses(): Promise<IWarehouse[]> {
  const res = await axios.get<IWarehouse[]>(endpoints.warehouses.list);
  return res.data;
}

export async function getBankAccounts(): Promise<IBankAccount[]> {
  const res = await axios.get<IBankAccount[]>(endpoints.bankAccounts.list);
  return res.data;
}

export async function getSuppliers(keyword?: string): Promise<ISupplier[]> {
  const res = await axios.get<ISupplier[]>(endpoints.suppliers.list, { params: { keyword: keyword || undefined, isActive: true } });
  return res.data;
}

// ── Hoá đơn ─────────────────────────────────────────────────────────────

/** fromDate/toDate là ngày (yyyy-MM-dd) theo giờ Việt Nam — core-be đổi ra mốc UTC. */
export async function getSalesOrders(params: {
  keyword?: string;
  fromDate?: string;
  toDate?: string;
  pageNumber?: number;
  pageSize?: number;
}): Promise<IPagedSalesOrders> {
  const res = await axios.get<IPagedSalesOrders>(endpoints.salesOrders.list, {
    params: { pageNumber: 1, pageSize: 20, ...params, keyword: params.keyword?.trim() || undefined },
  });
  return res.data;
}

export type CreateSalesReturnInput = {
  /** 1 = theo hoá đơn. */
  returnType: 1;
  salesOrderId: string;
  customerId: string | null;
  warehouseId: string;
  note: string | null;
  lines: { productId: string; quantity: number; price: number }[];
};

/**
 * Tạo phiếu trả (nháp) rồi đọc lại tổng phiếu — ở máy quầy server đặt lại giá theo hoá đơn nên tổng có thể khác số
 * app ước tính.
 */
export async function createSalesReturn(input: CreateSalesReturnInput): Promise<{ id: string; returnTotal: number | null }> {
  const created = await axios.post<{ id: string }>(endpoints.salesReturns.create, input);
  const id = created.data.id;
  try {
    const detail = await axios.get<{ returnTotal: number }>(endpoints.salesReturns.details(id));
    return { id, returnTotal: detail.data.returnTotal };
  } catch {
    return { id, returnTotal: null };
  }
}

/** Hoàn tất phiếu trả: nhập lại kho + ghi tiền hoàn cho khách (máy quầy: không vượt tổng phiếu). */
export async function completeSalesReturn(id: string, refundAmount: number): Promise<void> {
  await axios.post(endpoints.salesReturns.complete(id), { refundAmount });
}

export async function getSalesOrder(id: string): Promise<ISalesOrder> {
  const res = await axios.get<ISalesOrder>(endpoints.salesOrders.details(id));
  return res.data;
}

/** Kết quả thô của POST /sales-orders: mã trạng thái + body. `status: null` = không nhận được trả lời dùng được. */
export type SaleHttpResult = { status: number | null; data: unknown };

/**
 * Tạo hoá đơn bán — core-be lưu đơn và trừ tồn. Chỉ xếp hàng đẩy sang KiotViet khi cửa hàng có đẩy hoá đơn
 * (kiotVietSyncStatus = Pending); còn lại hoá đơn chỉ lưu trong hệ thống (NotPushed). core-be cũ không trả
 * kiotVietSyncStatus.
 *
 * Không ném lỗi: trả mã trạng thái để nơi gọi phân biệt "máy chủ từ chối" (4xx — chắc chắn chưa tạo hoá đơn)
 * với "chưa biết kết quả" (hết `timeoutMs`, mất mạng, 5xx → `status: null`). Interceptor chung chỉ trả body
 * nên 4xx được nhận về như phản hồi thường; riêng 401 vẫn đi đường lỗi để axios khôi phục phiên rồi gửi lại.
 */
export async function submitSale(data: ICreateSaleRequest, timeoutMs: number): Promise<SaleHttpResult> {
  try {
    const res = await axios.post<unknown>(endpoints.salesOrders.create, data, {
      timeout: timeoutMs,
      validateStatus: (status) => status !== 401 && status < 500,
    });
    return { status: res.status, data: res.data };
  } catch (error) {
    return { status: null, data: error };
  }
}

// ── Nhập hàng ───────────────────────────────────────────────────────────

export async function getPurchaseOrders(params: { status?: number; pageNumber?: number; pageSize?: number }): Promise<IPagedPurchaseOrders> {
  const res = await axios.get<IPagedPurchaseOrders>(endpoints.purchaseOrders.list, { params: { pageNumber: 1, pageSize: 20, ...params } });
  return res.data;
}

export async function getPurchaseOrder(id: string): Promise<IPurchaseOrder> {
  const res = await axios.get<IPurchaseOrder>(endpoints.purchaseOrders.details(id));
  return res.data;
}

export async function createPurchaseOrder(data: ICreatePurchaseOrderRequest): Promise<{ id: string }> {
  const res = await axios.post<{ id: string }>(endpoints.purchaseOrders.create, data);
  return res.data;
}

export async function confirmPurchaseOrder(id: string): Promise<void> {
  await axios.post(endpoints.purchaseOrders.confirm(id));
}

export async function receivePurchaseOrder(id: string, items: { purchaseOrderItemId: string; receivedQuantity: number }[]): Promise<void> {
  await axios.post(endpoints.purchaseOrders.receive(id), { items });
}

/** Đơn vị gốc và các đơn vị mua (quy đổi) của một hàng — để nhập hàng theo thùng / gói / hộp. */
export async function getProductUnits(productId: string): Promise<import('src/features/purchase/purchase-units').ProductUnits> {
  const res = await axios.get(endpoints.products.units(productId));
  return res.data;
}

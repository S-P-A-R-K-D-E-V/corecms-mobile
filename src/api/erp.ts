import axios, { endpoints } from './axios';
import type {
  IBankAccount,
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

export async function getProducts(params: { keyword?: string; page?: number; pageSize?: number }): Promise<IPaged<IProductListItem>> {
  const res = await axios.get<IPaged<IProductListItem>>(endpoints.products.list, {
    params: { isActive: true, page: 1, pageSize: 30, ...params, keyword: params.keyword?.trim() || undefined },
  });
  return res.data;
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

export async function getSalesOrder(id: string): Promise<ISalesOrder> {
  const res = await axios.get<ISalesOrder>(endpoints.salesOrders.details(id));
  return res.data;
}

/** Tạo hoá đơn bán — core-be lưu đơn, trừ tồn và xếp hàng đẩy sang KiotViet. */
export async function createSale(data: ICreateSaleRequest): Promise<{ id: string }> {
  const res = await axios.post<{ id: string }>(endpoints.salesOrders.create, data);
  return res.data;
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

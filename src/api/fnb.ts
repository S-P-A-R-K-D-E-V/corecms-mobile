import axios, { endpoints } from './axios';

import { putToPresignedUrl, readLocalFile } from './presigned-upload';

import type {
  FnbDisposalReason,
  IFnbBatch,
  IFnbBatchRecipeBook,
  IFnbCustomer,
  IFnbDisposal,
  IFnbFloor,
  IFnbLotsReport,
  IFnbMenu,
  IFnbStockCount,
  IFnbStockReport,
  IFnbSync,
  IOpenOrder,
} from 'src/types/fnb';

// ----------------------------------------------------------------------
// Đọc F&B (contract 3.1, 4.1, 4.3, 5.2, 7). Lệnh ghi của ĐƠN không nằm ở đây — đi qua hàng đợi
// src/features/fnb/write-queue.ts. Riêng thiết lập (thêm khu vực / bàn, hết món) gọi thẳng, cần mạng (contract 3.2, 4).
// ----------------------------------------------------------------------

/** Phản hồi kèm mã trạng thái (4xx không ném lỗi; mất mạng / 5xx ném như thường). */
export type FnbHttp<T> = { status: number; data: T | unknown };

const keepStatus = { validateStatus: (s: number) => s !== 401 && s < 500 };

export async function getFnbMenu(branchId: string): Promise<IFnbMenu> {
  const res = await axios.get<IFnbMenu>(endpoints.fnb.menu, { params: { branchId } });
  return res.data;
}

export async function getFnbFloorRaw(branchId: string): Promise<FnbHttp<IFnbFloor>> {
  const res = await axios.get(endpoints.fnb.floor, { params: { branchId }, ...keepStatus });
  return { status: res.status, data: res.data };
}

export async function getFnbAreas(branchId: string): Promise<
  { id: string; name: string; sortOrder: number; isActive: boolean; tables?: { id: string; name: string; seats: number | null; sortOrder: number; isActive: boolean }[] }[]
> {
  const res = await axios.get(endpoints.fnb.areas, { params: { branchId } });
  return Array.isArray(res.data) ? res.data : [];
}

export async function getFnbSyncRaw(branchId: string, cursor: string | null): Promise<FnbHttp<IFnbSync>> {
  const res = await axios.get(endpoints.fnb.sync, { params: { branchId, cursor: cursor || undefined, limit: 200 }, ...keepStatus });
  return { status: res.status, data: res.data };
}

export async function getFnbOrder(orderId: string): Promise<IOpenOrder> {
  const res = await axios.get<IOpenOrder>(endpoints.fnb.order(orderId));
  return res.data;
}

/** Thêm khu vực (Quản lý). */
export async function createFnbArea(branchId: string, name: string): Promise<{ id: string; name: string }> {
  const res = await axios.post(endpoints.fnb.areas, { branchId, name });
  return res.data;
}

/** Thêm bàn vào khu vực (Quản lý). */
export async function createFnbTable(data: { branchId: string; areaId: string; name: string; seats?: number | null }) {
  const res = await axios.post(endpoints.fnb.tables, data);
  return res.data as { id: string; name: string };
}

/** Đánh dấu hết món / có lại cho một món, size hoặc món thêm ở chi nhánh (nhân viên làm được). */
export async function setFnbSoldOut(branchId: string, productId: string, isSoldOut: boolean) {
  const res = await axios.put(endpoints.fnb.soldOut, { branchId, productId, isSoldOut });
  return res.data as { productId: string; isSoldOut: boolean; menuVersion: string };
}

// ── Kho nguyên liệu: pha mẻ bán thành phẩm ──────────────────────────────

/** Bán thành phẩm kèm công thức mẻ + nguyên liệu (tên, đơn vị, tồn của chi nhánh). */
export async function getFnbBatchRecipes(branchId: string): Promise<IFnbBatchRecipeBook> {
  const res = await axios.get<IFnbBatchRecipeBook>(endpoints.fnb.batchRecipes, { params: { branchId } });
  return res.data;
}

/** Lập phiếu pha mẻ — ghi kho ngay. actualYield / expiryDate bỏ trống = theo công thức. Gửi lại cùng clientRequestId chỉ ra một phiếu. */
export async function createFnbBatch(data: {
  branchId: string;
  clientRequestId: string;
  productId: string;
  batchCount: number;
  actualYield?: number | null;
  expiryDate?: string | null;
  note?: string | null;
}): Promise<IFnbBatch> {
  const res = await axios.post<IFnbBatch>(endpoints.fnb.batches, data);
  return res.data;
}

// ── Kho nguyên liệu: xuất huỷ ───────────────────────────────────────────

/** Tồn nguyên liệu của chi nhánh (kèm đơn vị quy đổi) — để chọn nguyên liệu khi xuất huỷ. */
export async function getFnbStock(branchId: string): Promise<IFnbStockReport> {
  const res = await axios.get<IFnbStockReport>(endpoints.fnb.stock, { params: { branchId } });
  return res.data;
}

/** Ảnh chụp trên máy chờ tải lên. */
export type DisposalPhoto = { uri: string; contentType: string; fileName: string };

/** Tải ảnh hàng huỷ thẳng lên R2: xin URL ký sẵn rồi PUT từng ảnh; trả khoá ảnh để gửi kèm phiếu. */
export async function uploadFnbDisposalPhotos(photos: DisposalPhoto[]): Promise<string[]> {
  if (photos.length === 0) return [];
  const res = await axios.post<{ objectKey: string; uploadUrl: string }[]>(endpoints.fnb.disposalPhotos, {
    files: photos.map((p) => ({ fileName: p.fileName, contentType: p.contentType })),
  });
  await Promise.all(
    res.data.map(async (slot, index) => {
      const photo = photos[index];
      await putToPresignedUrl(slot, await readLocalFile(photo.uri), photo.contentType);
    })
  );
  return res.data.map((slot) => slot.objectKey);
}

/** Lập phiếu xuất huỷ. Nhân viên lập → Pending (chờ duyệt); quản lý lập → Completed (trừ kho ngay). */
export async function createFnbDisposal(data: {
  branchId: string;
  clientRequestId: string;
  note?: string | null;
  photoKeys: string[];
  lines: { productId: string; quantity: number; unitId: string | null; reason: FnbDisposalReason }[];
}): Promise<IFnbDisposal> {
  const res = await axios.post<IFnbDisposal>(endpoints.fnb.disposals, data);
  return res.data;
}

// ── Kho nguyên liệu: kiểm kho ───────────────────────────────────────────

/** Phiếu kiểm kho của chi nhánh theo trạng thái (mới nhất trước), không kèm dòng. */
export async function getFnbStockCounts(branchId: string, status?: IFnbStockCount['status']): Promise<IFnbStockCount[]> {
  const res = await axios.get<IFnbStockCount[]>(endpoints.fnb.stockCounts, { params: { branchId, status } });
  return res.data;
}

export async function getFnbStockCount(id: string): Promise<IFnbStockCount> {
  const res = await axios.get<IFnbStockCount>(endpoints.fnb.stockCount(id));
  return res.data;
}

/** Lập phiếu kiểm nháp: Recipe = nguyên liệu có trong định lượng, All = mọi nguyên liệu. */
export async function createFnbStockCount(data: { branchId: string; scope: 'Recipe' | 'All'; note?: string | null }): Promise<IFnbStockCount> {
  const res = await axios.post<IFnbStockCount>(endpoints.fnb.stockCounts, data);
  return res.data;
}

/** Lưu số đếm: mỗi dòng gồm các phần theo đơn vị (unitId null = đơn vị gốc); parts rỗng = xoá số đếm. */
export async function saveFnbStockCount(
  id: string,
  entries: { lineId: string; parts: { unitId: string | null; quantity: number }[] }[]
): Promise<IFnbStockCount> {
  const res = await axios.put<IFnbStockCount>(endpoints.fnb.stockCountEntries(id), { entries });
  return res.data;
}

/** Nộp phiếu kiểm để quản lý duyệt. */
export async function submitFnbStockCount(id: string, note?: string | null): Promise<IFnbStockCount> {
  const res = await axios.post<IFnbStockCount>(endpoints.fnb.stockCountReview(id), { action: 'submit', note });
  return res.data;
}

/** Lô nguyên liệu còn hàng của chi nhánh kèm hạn dùng. */
export async function getFnbLots(branchId: string): Promise<IFnbLotsReport> {
  const res = await axios.get<IFnbLotsReport>(endpoints.fnb.stockLots, { params: { branchId } });
  return res.data;
}

/** Tìm khách hàng đang hoạt động theo tên / số điện thoại / mã (khách hàng dùng chung cả cửa hàng). */
export async function searchFnbCustomers(keyword: string): Promise<IFnbCustomer[]> {
  const res = await axios.get<IFnbCustomer[]>(endpoints.fnb.customers, { params: { keyword, isActive: true } });
  return res.data;
}

/** Phiếu pha mẻ của chi nhánh trong khoảng ngày (yyyy-MM-dd, tính cả hai đầu), mới nhất trước. */
export async function getFnbBatches(branchId: string, from: string, to: string): Promise<IFnbBatch[]> {
  const res = await axios.get<IFnbBatch[]>(endpoints.fnb.batches, { params: { branchId, from, to } });
  return res.data;
}

/** Huỷ phiếu pha: hoàn nguyên liệu, trừ bán thành phẩm của phiếu. Quản lý bắt buộc ghi lý do. */
export async function cancelFnbBatch(id: string, note?: string | null): Promise<IFnbBatch> {
  const res = await axios.post<IFnbBatch>(endpoints.fnb.batchCancel(id), { note });
  return res.data;
}

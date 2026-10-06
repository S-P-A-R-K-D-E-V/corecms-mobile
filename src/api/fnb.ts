import axios, { endpoints } from './axios';

import type { IFnbFloor, IFnbMenu, IFnbSync, IOpenOrder } from 'src/types/fnb';

// ----------------------------------------------------------------------
// Đọc F&B (contract 3.1, 4.1, 4.3, 5.2, 7). Lệnh GHI không nằm ở đây — mọi lệnh ghi đi qua hàng đợi
// src/features/fnb/write-queue.ts.
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

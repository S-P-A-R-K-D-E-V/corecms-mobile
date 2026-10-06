import type { IFnbFloor, IFnbSync } from 'src/types/fnb';

import { FnbCodes, problemCode } from './fnb-errors';

// ----------------------------------------------------------------------
// Đọc phản hồi GET /fnb/floor và GET /fnb/sync (contract 4.3, 7) — phần quyết định không dính mạng / giao diện.
// core-be hiện chưa có hai endpoint này (bước 1 mới có khu vực / bàn): 404 KHÔNG kèm mã lỗi = endpoint chưa có
// → sơ đồ dựng từ GET /fnb/areas, không đồng bộ, hỏi lại sơ đồ mỗi 15 giây.
// ----------------------------------------------------------------------

/** Nhịp hỏi /fnb/sync (contract 7): 5 giây khi đang mở màn F&B, 15 giây khi để yên; không bao giờ dưới 2 giây. */
export const SYNC_FOREGROUND_MS = 5_000;
export const SYNC_IDLE_MS = 15_000;

export type FloorRead = { kind: 'ok'; floor: IFnbFloor } | { kind: 'unsupported' } | { kind: 'error'; body: unknown };

export function readFloorResponse(status: number, data: unknown): FloorRead {
  if (status >= 200 && status < 300 && data && typeof data === 'object') return { kind: 'ok', floor: data as IFnbFloor };
  if (status === 404 && !problemCode(data)) return { kind: 'unsupported' };
  return { kind: 'error', body: data };
}

export type SyncRead =
  | { kind: 'ok'; sync: IFnbSync }
  /** Cursor hết hạn → bắt đầu lại không cursor. */
  | { kind: 'restart' }
  /** Máy chủ chưa có /fnb/sync. */
  | { kind: 'unsupported' }
  | { kind: 'error' };

export function readSyncResponse(status: number, data: unknown): SyncRead {
  if (status >= 200 && status < 300 && data && typeof data === 'object') {
    const d = data as IFnbSync;
    return { kind: 'ok', sync: { ...d, orders: d.orders ?? [], tickets: d.tickets ?? [] } };
  }
  const code = problemCode(data);
  if (status === 409 && code === FnbCodes.cursorExpired) return { kind: 'restart' };
  if (status === 404 && !code) return { kind: 'unsupported' };
  return { kind: 'error' };
}

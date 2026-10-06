import type { IKitchenTicket, IOpenOrder } from 'src/types/fnb';

// ----------------------------------------------------------------------
// Đọc phản hồi lỗi của /fnb/* (contract 1.4): problem+json với `errorCodes[0]` là mã máy, `title` là câu tiếng
// Việt hiện được cho người dùng; một số mã kèm `order` / `otherOrder` / `ticket` / `openOrderIds` / `productIds`.
// Riêng `feature_disabled` (403) có dạng `{ error, message, featureKey }`.
// ----------------------------------------------------------------------

export type FnbProblem = {
  code: string | null;
  title: string | null;
  order: IOpenOrder | null;
  otherOrder: IOpenOrder | null;
  ticket: IKitchenTicket | null;
  openOrderIds: string[];
  productIds: string[];
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const asOrder = (v: unknown): IOpenOrder | null =>
  isObj(v) && typeof v.id === 'string' && typeof v.version === 'number' ? (v as unknown as IOpenOrder) : null;

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Mã lỗi theo helper của contract: `errorCodes[0] ?? keys(errors)[0]`; `feature_disabled` dùng `error`. */
export function problemCode(body: unknown): string | null {
  if (!isObj(body)) return null;
  const codes = asStrings(body.errorCodes);
  if (codes[0]) return codes[0];
  if (isObj(body.errors)) {
    const first = Object.keys(body.errors)[0];
    if (first) return first;
  }
  return typeof body.error === 'string' ? body.error : null;
}

export function readProblem(body: unknown): FnbProblem {
  const b = isObj(body) ? body : {};
  const title = typeof b.title === 'string' ? b.title : typeof b.message === 'string' ? b.message : null;
  return {
    code: problemCode(body),
    title,
    order: asOrder(b.order),
    otherOrder: asOrder(b.otherOrder),
    ticket: isObj(b.ticket) && typeof b.ticket.id === 'string' ? (b.ticket as unknown as IKitchenTicket) : null,
    openOrderIds: asStrings(b.openOrderIds),
    productIds: asStrings(b.productIds),
  };
}

export const FnbCodes = {
  versionConflict: 'OpenOrder.VersionConflict',
  notOpen: 'OpenOrder.NotOpen',
  managerRequired: 'OpenOrder.ManagerRequired',
  tableOccupied: 'DiningTable.Occupied',
  cursorExpired: 'Fnb.CursorExpired',
} as const;

import axios, { endpoints } from './axios';
import type {
  IShiftCashSummary,
  IShiftCashGeoStamp,
  IAddShiftCashTransactionRequest,
  IUpdateShiftCashTransactionRequest,
  IUpdateDenominationBatchRequest,
  IFinalizeShiftCashRequest,
  IKiotVietDailySummary,
  IShiftCashRevenue,
  IShiftCashReconciliation,
  IShiftCashInvestigation,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Kiểm tiền quầy — gọi cùng endpoint với core-fe. BE chặn ở cổng RequireShiftCashAccess: không phải
// Admin thì phải có ca hôm nay (giờ VN), chỉ ngày hôm nay, và (khi bật geofence) đang ở cửa hàng — đọc
// toạ độ từ header X-Geo-* trên MỌI lệnh (kể cả GET/DELETE không có body), nên hàm nào cũng nhận `geo`.
// Bị từ chối → 403 { error: 'ShiftCash.*', message } (xem features/shift-cash/access.ts).
// ----------------------------------------------------------------------

type Geo = IShiftCashGeoStamp | null | undefined;

/** Header toạ độ đã xác minh ở cổng (X-Geo-Latitude/Longitude/Accuracy — mét). Không có toạ độ → {}. */
export function geoHeaders(geo?: Geo): Record<string, string> {
  if (geo?.latitude == null || geo?.longitude == null) return {};
  return {
    'X-Geo-Latitude': String(geo.latitude),
    'X-Geo-Longitude': String(geo.longitude),
    ...(geo.accuracy != null ? { 'X-Geo-Accuracy': String(geo.accuracy) } : {}),
  };
}

export async function getShiftCashSummary(date: string, geo?: Geo): Promise<IShiftCashSummary> {
  const res = await axios.get<IShiftCashSummary>(endpoints.shiftCash.summary, {
    params: { date },
    headers: geoHeaders(geo),
  });
  return res.data;
}

/** Doanh thu KiotViet trong ngày cho màn kiểm quầy — BE gác cùng cổng kiểm quầy nên cũng gửi X-Geo-*. */
export async function getKiotVietDailySummary(date: string, geo?: Geo): Promise<IKiotVietDailySummary> {
  const res = await axios.get<IKiotVietDailySummary>(endpoints.kiotViet.dailySummary, {
    params: { date },
    headers: geoHeaders(geo),
  });
  return res.data;
}

/**
 * Doanh thu của ngày từ dữ liệu HỆ THỐNG (mọi cửa hàng, có nối KiotViet hay không). Không có quyền xem doanh thu →
 * { date, masked: true } (BE không gửi con số nào) — màn hiện "****".
 */
export async function getShiftCashRevenue(date: string, geo?: Geo): Promise<IShiftCashRevenue> {
  const res = await axios.get<IShiftCashRevenue>(endpoints.shiftCash.revenue, {
    params: { date },
    headers: geoHeaders(geo),
  });
  return res.data;
}

/** Kiểm tra chênh lệch: két, chuyển khoản ↔ ngân hàng, KiotViet ↔ hệ thống (quyền xem doanh thu). */
export async function getShiftCashReconciliation(date: string, geo?: Geo): Promise<IShiftCashReconciliation> {
  const res = await axios.get<IShiftCashReconciliation>(endpoints.shiftCash.reconciliation, {
    params: { date },
    headers: geoHeaders(geo),
  });
  return res.data;
}

/** Nguyên nhân có thể của lệch két ngày đã chốt — chỉ người giám sát. Chưa chốt → null (BE 404 NotFinalized). */
export async function getShiftCashInvestigation(date: string, geo?: Geo): Promise<IShiftCashInvestigation | null> {
  const res = await axios.get<IShiftCashInvestigation>(endpoints.shiftCash.investigation, {
    params: { date },
    headers: geoHeaders(geo),
    validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
  });
  return res.status === 404 ? null : res.data;
}

export async function openCounter(date: string, geo?: Geo): Promise<void> {
  await axios.post(endpoints.shiftCash.open, { date, ...geo }, { headers: geoHeaders(geo) });
}

// Lệnh ghi đã kèm toạ độ trong body (lưu audit) — header lấy `geo` nếu truyền, không thì lấy từ body.
export async function addShiftCashTransaction(
  data: IAddShiftCashTransactionRequest,
  geo?: Geo
): Promise<{ id: string }> {
  const res = await axios.post<{ id: string }>(endpoints.shiftCash.transactions, data, {
    headers: geoHeaders(geo ?? data),
  });
  return res.data;
}

export async function updateShiftCashTransaction(
  id: string,
  data: IUpdateShiftCashTransactionRequest,
  geo?: Geo
): Promise<void> {
  await axios.put(endpoints.shiftCash.transactionDetail(id), data, { headers: geoHeaders(geo ?? data) });
}

export async function deleteShiftCashTransaction(id: string, geo?: Geo): Promise<void> {
  await axios.delete(endpoints.shiftCash.transactionDetail(id), { headers: geoHeaders(geo) });
}

export async function updateDenominationBatch(data: IUpdateDenominationBatchRequest, geo?: Geo): Promise<void> {
  await axios.put(endpoints.shiftCash.denominationsBatch, data, { headers: geoHeaders(geo ?? data) });
}

export async function finalizeShiftCash(
  data: IFinalizeShiftCashRequest,
  geo?: Geo
): Promise<{ id: string; closingBalance: number; isFinalized: boolean }> {
  const res = await axios.post(endpoints.shiftCash.finalize, data, { headers: geoHeaders(geo ?? data) });
  return res.data;
}

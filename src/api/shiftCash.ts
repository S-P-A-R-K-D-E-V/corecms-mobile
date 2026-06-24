import axios, { endpoints } from './axios';
import type {
  IShiftCashSummary,
  IShiftCashGeoStamp,
  IAddShiftCashTransactionRequest,
  IUpdateShiftCashTransactionRequest,
  IUpdateDenominationBatchRequest,
  IFinalizeShiftCashRequest,
  IKiotVietDailySummary,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Kiểm tiền quầy — gọi cùng endpoint với core-fe (BE chỉ [Authorize]).
// ----------------------------------------------------------------------

export async function getShiftCashSummary(date: string): Promise<IShiftCashSummary> {
  const res = await axios.get<IShiftCashSummary>(endpoints.shiftCash.summary, { params: { date } });
  return res.data;
}

export async function getKiotVietDailySummary(date: string): Promise<IKiotVietDailySummary> {
  const res = await axios.get<IKiotVietDailySummary>(endpoints.kiotViet.dailySummary, { params: { date } });
  return res.data;
}

export async function openCounter(date: string, geo?: IShiftCashGeoStamp): Promise<void> {
  await axios.post(endpoints.shiftCash.open, { date, ...geo });
}

export async function addShiftCashTransaction(data: IAddShiftCashTransactionRequest): Promise<{ id: string }> {
  const res = await axios.post<{ id: string }>(endpoints.shiftCash.transactions, data);
  return res.data;
}

export async function updateShiftCashTransaction(
  id: string,
  data: IUpdateShiftCashTransactionRequest
): Promise<void> {
  await axios.put(endpoints.shiftCash.transactionDetail(id), data);
}

export async function deleteShiftCashTransaction(id: string): Promise<void> {
  await axios.delete(endpoints.shiftCash.transactionDetail(id));
}

export async function updateDenominationBatch(data: IUpdateDenominationBatchRequest): Promise<void> {
  await axios.put(endpoints.shiftCash.denominationsBatch, data);
}

export async function finalizeShiftCash(
  data: IFinalizeShiftCashRequest
): Promise<{ id: string; closingBalance: number; isFinalized: boolean }> {
  const res = await axios.post(endpoints.shiftCash.finalize, data);
  return res.data;
}

import axios, { endpoints } from './axios';
import { putFileToPresignedUrl } from 'src/services/upload/presigned-put';
import type {
  ICorrectiveAction,
  IInspection,
  IInspectionFault,
  IInspectionResultInput,
  IInspectionShift,
  IShiftWorkItem,
  IShiftWorkShift,
  InspectionType,
} from 'src/types/inspection';

// ----------------------------------------------------------------------
// Kiểm tra cửa hàng. Ảnh: xin URL presigned rồi PUT thẳng tệp trên máy lên kho riêng tư (putFileToPresignedUrl — có thử
// lại, có hết giờ), sau đó gửi object key kèm kết quả / lúc đánh dấu đã sửa.
// ----------------------------------------------------------------------

export async function getInspectionShifts(date?: string): Promise<IInspectionShift[]> {
  const response = await axios.get<IInspectionShift[]>(endpoints.inspections.shifts, { params: { date } });
  return response.data;
}

export async function getInspection(id: string): Promise<IInspection> {
  const response = await axios.get<IInspection>(endpoints.inspections.details(id));
  return response.data;
}

export async function startInspection(
  type: InspectionType,
  date: string,
  shiftScheduleId: string,
  isSpotCheck: boolean,
): Promise<IInspection> {
  const response = await axios.post<IInspection>(endpoints.inspections.list, { type, date, shiftScheduleId, isSpotCheck });
  return response.data;
}

export async function saveInspectionResults(id: string, results: IInspectionResultInput[]): Promise<IInspection> {
  const response = await axios.put<IInspection>(endpoints.inspections.results(id), { results });
  return response.data;
}

export async function submitInspection(id: string, note?: string | null): Promise<IInspection> {
  const response = await axios.post<IInspection>(endpoints.inspections.submit(id), { note: note || null });
  return response.data;
}

export type LocalPhoto = { uri: string; type: string };

/** Tải một ảnh trên máy lên kho riêng tư của lượt kiểm, trả object key. */
export async function uploadInspectionPhoto(inspectionId: string, photo: LocalPhoto): Promise<string> {
  const presign = await axios.post<{ objectKey: string; uploadUrl: string }[]>(endpoints.inspections.presignPhotos(inspectionId), {
    files: [{ contentType: photo.type }],
  });
  const [target] = presign.data;
  await putFileToPresignedUrl(target.uploadUrl, photo.uri, photo.type);
  return target.objectKey;
}

/** Lỗi đang mở: của mình, hoặc cả cửa hàng (cần inspection.read). */
export async function getOpenInspectionFaults(scope: 'mine' | 'all' = 'mine'): Promise<IInspectionFault[]> {
  const response = await axios.get<IInspectionFault[]>(endpoints.inspections.faults, { params: { scope } });
  return response.data;
}

/** Lỗi ghi cho chính mình trong tháng ("YYYY-MM"; bỏ trống = tháng này). */
export async function getMyInspectionFaults(month?: string): Promise<IInspectionFault[]> {
  const response = await axios.get<IInspectionFault[]>(endpoints.inspections.mine, { params: { month } });
  return response.data;
}

export async function fixInspectionResult(resultId: string, note: string | null, fixedPhotoKeys: string[]): Promise<void> {
  await axios.post(endpoints.inspections.fix(resultId), { note, fixedPhotoKeys });
}

// ── Công việc trong ca: hạng mục nhân viên tự làm, chụp ảnh khi xong ───────────────────────────

/** Hạng mục tự làm của các ca của tôi trong ngày (kèm ai đã làm, kết quả kiểm của ca). */
export async function getMyShiftWork(date: string): Promise<IShiftWorkShift[]> {
  const response = await axios.get<IShiftWorkShift[]>(endpoints.shiftWork.mine, { params: { date } });
  return response.data;
}

/** Tải một ảnh việc đã làm lên kho riêng tư của ca, trả object key. */
export async function uploadShiftWorkPhoto(shiftScheduleId: string, date: string, photo: LocalPhoto): Promise<string> {
  const presign = await axios.post<{ objectKey: string; uploadUrl: string }[]>(endpoints.shiftWork.presignPhotos, {
    shiftScheduleId,
    date,
    files: [{ contentType: photo.type }],
  });
  const [target] = presign.data;
  await putFileToPresignedUrl(target.uploadUrl, photo.uri, photo.type);
  return target.objectKey;
}

export async function completeShiftWork(input: {
  date: string;
  shiftScheduleId: string;
  itemId: string;
  note: string | null;
  photoKeys: string[];
}): Promise<IShiftWorkItem> {
  const response = await axios.post<IShiftWorkItem>(endpoints.shiftWork.complete, input);
  return response.data;
}

// ── Sửa tận gốc giao cho tôi ───────────────────────────────────────────

export async function getMyCorrectiveActions(): Promise<ICorrectiveAction[]> {
  const response = await axios.get<ICorrectiveAction[]>(endpoints.correctiveActions.mine);
  return response.data;
}

export async function markCorrectiveActionDone(id: string, note: string | null): Promise<ICorrectiveAction> {
  const response = await axios.put<ICorrectiveAction>(endpoints.correctiveActions.done(id), { note });
  return response.data;
}

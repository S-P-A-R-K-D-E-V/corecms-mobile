import axios, { endpoints } from './axios';
import { putFileToPresignedUrl } from 'src/services/upload/presigned-put';
import type {
  IHrRecord,
  IShiftLeave,
  IWorkTask,
  ISalesTarget,
  IPolicyDocument,
  IPerformanceScore,
  IEmploymentContract,
} from 'src/types/hr';

// ----------------------------------------------------------------------
// Nhân sự — phần của nhân viên. Ảnh nghiệm thu nhiệm vụ: xin URL presigned rồi PUT thẳng tệp lên kho riêng tư, sau đó
// gửi object key khi nộp.
// ----------------------------------------------------------------------

export async function getMyShiftLeaves(): Promise<IShiftLeave[]> {
  const response = await axios.get<IShiftLeave[]>(endpoints.hr.leaveMine);
  return response.data;
}

export async function createShiftLeave(body: { shiftAssignmentId: string; reason: string; isEmergency: boolean }): Promise<IShiftLeave> {
  const response = await axios.post<IShiftLeave>(endpoints.hr.leave, body);
  return response.data;
}

export async function cancelShiftLeave(id: string): Promise<IShiftLeave> {
  const response = await axios.put<IShiftLeave>(endpoints.hr.leaveCancel(id));
  return response.data;
}

export async function getPolicyDocuments(pendingOnly: boolean): Promise<IPolicyDocument[]> {
  const response = await axios.get<IPolicyDocument[]>(pendingOnly ? endpoints.hr.policiesPending : endpoints.hr.policiesActive);
  return response.data;
}

export async function acknowledgePolicyDocument(id: string): Promise<IPolicyDocument> {
  const response = await axios.post<IPolicyDocument>(endpoints.hr.policyAcknowledge(id));
  return response.data;
}

/** Target tuần đã công bố (nhân viên không thấy doanh thu thực tế). */
export async function getSalesTargets(from: string, to: string): Promise<ISalesTarget[]> {
  const response = await axios.get<ISalesTarget[]>(endpoints.hr.targets, { params: { from, to } });
  return response.data;
}

export async function getMyWorkTasks(month?: string): Promise<IWorkTask[]> {
  const response = await axios.get<IWorkTask[]>(endpoints.hr.tasksMine, { params: { month } });
  return response.data;
}

export async function createInitiative(title: string, description: string): Promise<IWorkTask> {
  const response = await axios.post<IWorkTask>(endpoints.hr.taskInitiative, { title, description });
  return response.data;
}

export type LocalPhoto = { uri: string; type: string };

/** Tải một ảnh trên máy lên kho riêng tư của nhiệm vụ, trả object key. */
export async function uploadWorkTaskPhoto(taskId: string, photo: LocalPhoto): Promise<string> {
  const presign = await axios.post<{ objectKey: string; uploadUrl: string }[]>(endpoints.hr.taskPresign(taskId), {
    files: [{ contentType: photo.type }],
  });
  const [target] = presign.data;
  await putFileToPresignedUrl(target.uploadUrl, photo.uri, photo.type);
  return target.objectKey;
}

export async function submitWorkTask(id: string, note: string | null, photoKeys: string[]): Promise<IWorkTask> {
  const response = await axios.put<IWorkTask>(endpoints.hr.taskSubmit(id), { note, photoKeys });
  return response.data;
}

export async function getMyHrRecords(): Promise<IHrRecord[]> {
  const response = await axios.get<IHrRecord[]>(endpoints.hr.recordsMine);
  return response.data;
}

export async function signHrRecord(id: string, statement: string | null): Promise<IHrRecord> {
  const response = await axios.put<IHrRecord>(endpoints.hr.recordSign(id), { statement });
  return response.data;
}

export async function refuseHrRecord(id: string, reason: string): Promise<IHrRecord> {
  const response = await axios.put<IHrRecord>(endpoints.hr.recordRefuse(id), { reason });
  return response.data;
}

export async function getMyPerformance(): Promise<IPerformanceScore[]> {
  const response = await axios.get<IPerformanceScore[]>(endpoints.hr.performanceMine);
  return response.data;
}

/** Hợp đồng lao động của tôi — chỉ xem (Admin soạn, in, ký giấy và tải bản ký trên web). */
export async function getMyContracts(): Promise<IEmploymentContract[]> {
  const response = await axios.get<IEmploymentContract[]>(endpoints.hr.contractsMine);
  return response.data;
}

export async function requestPerformanceReview(id: string, note: string): Promise<IPerformanceScore> {
  const response = await axios.post<IPerformanceScore>(endpoints.hr.reviewRequest(id), { note });
  return response.data;
}

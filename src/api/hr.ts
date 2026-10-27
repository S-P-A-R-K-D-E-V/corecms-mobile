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
  ISupportShiftOpening,
  ICompensation,
  IMyWeeklyBonus,
  IPerformanceMonth,
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

// ── Ca hỗ trợ mở trên chợ ca ───────────────────────────────────────────

/** Ca hỗ trợ từ hôm nay tới 14 ngày tới (mặc định của BE). */
export async function getSupportShifts(): Promise<ISupportShiftOpening[]> {
  const response = await axios.get<ISupportShiftOpening[]>(endpoints.hr.supportShifts);
  return response.data;
}

export async function claimSupportShift(id: string): Promise<ISupportShiftOpening> {
  const response = await axios.post<ISupportShiftOpening>(endpoints.hr.supportShiftClaim(id), { note: null });
  return response.data;
}

export async function withdrawSupportClaim(claimId: string): Promise<ISupportShiftOpening> {
  const response = await axios.put<ISupportShiftOpening>(endpoints.hr.supportClaimWithdraw(claimId));
  return response.data;
}

export async function reviewSupportClaim(claimId: string, approve: boolean, note?: string): Promise<ISupportShiftOpening> {
  const response = await axios.put<ISupportShiftOpening>(endpoints.hr.supportClaimReview(claimId), { approve, note: note || null });
  return response.data;
}

/** Khoản bồi thường của tôi (chỉ xem). */
export async function getMyCompensations(): Promise<ICompensation[]> {
  const response = await axios.get<ICompensation[]>(endpoints.hr.compensationsMine);
  return response.data;
}

/** Thưởng doanh số tuần của tôi trong các tuần chứa [from, to] (yyyy-MM-dd). */
export async function getMyWeeklyBonus(from: string, to: string): Promise<IMyWeeklyBonus[]> {
  const response = await axios.get<IMyWeeklyBonus[]>(endpoints.hr.weeklyBonusMine, { params: { from, to } });
  return response.data;
}

/** [Quản lý] Điểm từng người của một tháng (yyyy-MM-01). */
export async function getPerformanceMonth(month: string): Promise<IPerformanceMonth> {
  const response = await axios.get<IPerformanceMonth>(endpoints.hr.performanceMonth, { params: { month } });
  return response.data;
}

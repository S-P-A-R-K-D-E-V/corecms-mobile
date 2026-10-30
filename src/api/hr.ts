import axios, { endpoints } from './axios';
import { putFileToPresignedUrl } from 'src/services/upload/presigned-put';
import type {
  IHrRules,
  IMyViolations,
  IViolationRule,
  IViolationEntry,
  IViolationMonth,
  IViolationPolicy,
  IHrRecord,
  IShiftLeave,
  IWorkTask,
  ISalesTarget,
  IPolicyDocument,
  IPerformanceScore,
  IMyProvisionalPerformance,
  IEmploymentContract,
  ISignContractRequest,
  ISupportShiftOpening,
  ICompensation,
  IMyWeeklyBonus,
  IPerformanceMonth,
  IPayrollComplaint,
  IPayrollComplaintWindow,
  IMyBonusProgram,
  IShiftStockCheck,
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

export type LocalPhoto = { uri: string; type: string };

/** Tải một ảnh trên máy lên kho riêng tư của việc giao riêng, trả object key. */
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

/** Hợp đồng lao động của tôi (Admin soạn trên web; nhân viên đọc và ký trên app / web). */
export async function getMyContracts(): Promise<IEmploymentContract[]> {
  const response = await axios.get<IEmploymentContract[]>(endpoints.hr.contractsMine);
  return response.data;
}

/** Nhân viên ký hợp đồng đang chờ ký: nét vẽ chữ ký (server tự dựng SVG) + đồng ý lời cam kết. */
export async function signContract(id: string, body: ISignContractRequest): Promise<IEmploymentContract> {
  const response = await axios.post<IEmploymentContract>(endpoints.hr.contractSign(id), body);
  return response.data;
}

export async function getMyProvisionalPerformance(): Promise<IMyProvisionalPerformance> {
  const response = await axios.get<IMyProvisionalPerformance>(endpoints.hr.performanceMineCurrent);
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

// ── Khiếu nại phiếu lương (Quy chế Điều 12.3) ───────────────────────────

export async function getMyPayrollComplaints(): Promise<IPayrollComplaint[]> {
  const response = await axios.get<IPayrollComplaint[]>(endpoints.hr.complaintsMine);
  return response.data;
}

export async function getPayrollComplaintWindow(payrollRecordId: string): Promise<IPayrollComplaintWindow> {
  const response = await axios.get<IPayrollComplaintWindow>(endpoints.hr.complaintWindow(payrollRecordId));
  return response.data;
}

export async function filePayrollComplaint(payrollRecordId: string, content: string): Promise<IPayrollComplaint> {
  const response = await axios.post<IPayrollComplaint>(endpoints.hr.complaints, { payrollRecordId, content });
  return response.data;
}

export async function withdrawPayrollComplaint(id: string): Promise<IPayrollComplaint> {
  const response = await axios.put<IPayrollComplaint>(endpoints.hr.complaintWithdraw(id));
  return response.data;
}

// ── Chương trình thưởng theo đơn ────────────────────────────────────────

/** Phần của tôi trong các chương trình đang bật, tháng của `month` (yyyy-MM-dd; mặc định tháng này). */
export async function getMyBonusPrograms(month?: string): Promise<IMyBonusProgram[]> {
  const response = await axios.get<IMyBonusProgram[]>(endpoints.hr.bonusProgramsMine, { params: { month } });
  return response.data;
}

// ── Kiểm hàng khu vực mỗi ca ────────────────────────────────────────────

/** Phiếu của các ca hôm nay mà tôi làm (quản lý: mọi phiếu hôm nay, có tồn máy + lệch). */
export async function getMyShiftStockChecks(): Promise<IShiftStockCheck[]> {
  const response = await axios.get<IShiftStockCheck[]>(endpoints.hr.stockChecksMine);
  return response.data;
}

/** quantity = null → xoá số đếm của dòng. */
export async function saveShiftStockCounts(
  id: string,
  entries: { lineId: string; quantity: number | null }[],
): Promise<IShiftStockCheck> {
  const response = await axios.put<IShiftStockCheck>(endpoints.hr.stockCheckCounts(id), { entries });
  return response.data;
}

export async function submitShiftStockCheck(id: string): Promise<IShiftStockCheck> {
  const response = await axios.post<IShiftStockCheck>(endpoints.hr.stockCheckSubmit(id));
  return response.data;
}

/** [Quản lý] Đã xem (phiếu đã nộp) / huỷ. */
export async function reviewShiftStockCheck(id: string, action: 'acknowledge' | 'cancel'): Promise<IShiftStockCheck> {
  const response = await axios.post<IShiftStockCheck>(endpoints.hr.stockCheckReview(id), { action });
  return response.data;
}

/** Luật nhân sự đang bật của cửa hàng; backend cũ chưa có → null (giữ cách hiện cũ). */
export async function getActiveHrRules(): Promise<IHrRules | null> {
  try {
    const response = await axios.get<IHrRules>(endpoints.hr.rulesActive);
    return response.data;
  } catch {
    return null;
  }
}

// ── Vi phạm & điểm trừ ───────────────────────────────────────────────

export async function getMyViolations(month: string): Promise<IMyViolations> {
  const response = await axios.get<IMyViolations>(endpoints.hr.violationsMine, { params: { month } });
  return response.data;
}

export async function complainViolation(id: string, text: string): Promise<IViolationEntry> {
  const response = await axios.post<IViolationEntry>(endpoints.hr.violationComplaint(id), { text });
  return response.data;
}

export async function getViolationRules(): Promise<IViolationRule[]> {
  const response = await axios.get<{ rules: IViolationRule[] }>(endpoints.hr.violationCatalog);
  return response.data.rules;
}

export async function getViolationSummary(month: string): Promise<IViolationMonth> {
  const response = await axios.get<IViolationMonth>(endpoints.hr.violationSummary, { params: { month } });
  return response.data;
}

export async function getViolations(month: string): Promise<IViolationEntry[]> {
  const response = await axios.get<IViolationEntry[]>(endpoints.hr.violations, { params: { month } });
  return response.data;
}

export async function createViolations(body: {
  ruleId: string;
  userIds: string[];
  occurredOn: string;
  quantity: number;
  note: string;
}): Promise<IViolationEntry[]> {
  const response = await axios.post<IViolationEntry[]>(endpoints.hr.violations, body);
  return response.data;
}

export async function cancelViolation(id: string, note: string): Promise<IViolationEntry> {
  const response = await axios.put<IViolationEntry>(endpoints.hr.violationCancel(id), { note });
  return response.data;
}

/** Cách tính điểm trừ (Admin, hr.rule.manage) — app chỉ dùng để bật / tắt nhanh "tính vào thưởng tuần". */
export async function saveViolationPolicy(policy: IViolationPolicy, appliesToBonus: boolean): Promise<IViolationPolicy> {
  const response = await axios.put<IViolationPolicy>(endpoints.hr.violationPolicy, {
    effectiveFrom: policy.effectiveFrom,
    halfBonusFromPoints: policy.halfBonusFromPoints ?? null,
    halfBonusPct: policy.halfBonusPct ?? null,
    noBonusFromPoints: policy.noBonusFromPoints ?? null,
    notCompleteFromPoints: policy.notCompleteFromPoints ?? null,
    appliesToBonus,
  });
  return response.data;
}

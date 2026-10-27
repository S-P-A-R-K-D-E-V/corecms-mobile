// ----------------------------------------------------------------------
// Nhân sự theo Quy chế / Nội quy CiCi — phần của nhân viên trên app (core-be /shift-leave, /policy-documents,
// /sales-targets, /work-tasks, /hr-records, /performance). Quản lý duyệt / giao / lập biên bản trên web.
// ----------------------------------------------------------------------

export type ShiftLeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export const SHIFT_LEAVE_STATUS_LABEL: Record<ShiftLeaveStatus, string> = {
  Pending: 'Chờ duyệt',
  Approved: 'Đã duyệt',
  Rejected: 'Từ chối',
  Cancelled: 'Đã huỷ',
};

export interface IShiftLeave {
  id: string;
  shiftAssignmentId: string;
  shiftDate: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  reason: string;
  isEmergency: boolean;
  isLateNotice: boolean;
  status: ShiftLeaveStatus;
  reviewNote?: string | null;
  createdAt: string;
}

export interface IPolicyDocument {
  id: string;
  code: string;
  title: string;
  version: number;
  url?: string | null;
  summary?: string | null;
  fileName?: string | null;
  fileContentType?: string | null;
  /** Link có chữ ký tới tệp văn bản ở kho riêng tư. */
  fileUrl?: string | null;
  isActive: boolean;
  publishedAt: string;
  acknowledgedAt?: string | null;
}

export interface ISalesTargetSlot {
  weekday: number;
  date: string;
  shiftScheduleId: string;
  shiftName: string;
  start: string;
  end: string;
  share: number;
  target: number;
}

/** Nhân viên chỉ nhận tuần đã công bố, không kèm doanh thu thực tế. */
export interface ISalesTarget {
  weekStart: string;
  targetAmount: number;
  publishedAt?: string | null;
  slots: ISalesTargetSlot[];
}

export type WorkTaskGroup = 'Content' | 'Inbox' | 'Packing' | 'Display' | 'Initiative' | 'Other';
export type WorkTaskStatus = 'Assigned' | 'Submitted' | 'Approved' | 'Rejected' | 'Cancelled';

export const WORK_TASK_GROUP_LABEL: Record<WorkTaskGroup, string> = {
  Content: 'Đăng nội dung',
  Inbox: 'Trả lời khách',
  Packing: 'Đóng gói đơn online',
  Display: 'Trang trí, trưng bày',
  Initiative: 'Sáng kiến',
  Other: 'Khác',
};

export const WORK_TASK_STATUS_LABEL: Record<WorkTaskStatus, string> = {
  Assigned: 'Đang làm',
  Submitted: 'Chờ duyệt',
  Approved: 'Đạt',
  Rejected: 'Trả lại',
  Cancelled: 'Đã huỷ',
};

export interface IWorkTask {
  id: string;
  group: WorkTaskGroup;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  status: WorkTaskStatus;
  submittedAt?: string | null;
  reviewNote?: string | null;
  implemented: boolean;
  createdAt: string;
  photos: { id: string; url: string; uploadedAt: string }[];
}

export type HrRecordType = 'CashDiscrepancy' | 'StockDiscrepancy' | 'Violation' | 'Warning';
export type HrRecordStatus = 'AwaitingSignature' | 'Signed' | 'RefusedToSign' | 'Voided';

export const HR_RECORD_TYPE_LABEL: Record<HrRecordType, string> = {
  CashDiscrepancy: 'Biên bản chênh lệch tiền',
  StockDiscrepancy: 'Biên bản chênh lệch hàng',
  Violation: 'Biên bản vi phạm nội quy',
  Warning: 'Biên bản cảnh báo hoàn thành công việc',
};

export const HR_RECORD_STATUS_LABEL: Record<HrRecordStatus, string> = {
  AwaitingSignature: 'Chờ ký',
  Signed: 'Đã ký',
  RefusedToSign: 'Không ký',
  Voided: 'Đã huỷ',
};

export interface IHrRecord {
  id: string;
  type: HrRecordType;
  occurredOn: string;
  amount?: number | null;
  description: string;
  cause?: string | null;
  personalFault?: boolean | null;
  violationLevel?: number | null;
  evaluatedMonth?: string | null;
  improvementPlan?: string | null;
  status: HrRecordStatus;
  staffStatement?: string | null;
  signedAt?: string | null;
  refusalReason?: string | null;
  voidReason?: string | null;
  createdAt: string;
}

export type PerformanceRating = 'NotRated' | 'NotComplete' | 'Complete' | 'Good' | 'Excellent';

export const PERFORMANCE_RATING_LABEL: Record<PerformanceRating, string> = {
  NotRated: 'Chưa xếp loại',
  NotComplete: 'Không hoàn thành',
  Complete: 'Hoàn thành',
  Good: 'Hoàn thành tốt',
  Excellent: 'Hoàn thành xuất sắc',
};

export interface IPerformanceShiftDetail {
  date: string;
  shift?: string | null;
  hours: number;
  revenue?: number;
  target?: number | null;
  pct?: number;
  excluded?: string;
}

export interface IPerformanceScore {
  id: string;
  month: string;
  shiftCount: number;
  hoursWorked: number;
  targetAchievementPct?: number | null;
  lateCount: number;
  missedCheckoutCount: number;
  inspectionFaults: number;
  discrepancyFaults: number;
  salesPoints: number;
  qualityPoints: number;
  taskPoints: number;
  disciplinePoints: number;
  reconciliationPoints: number;
  initiativePoints: number;
  total: number;
  isDefaultScore: boolean;
  rating: PerformanceRating;
  ratingReason?: string | null;
  details: { notes?: string[]; shifts?: IPerformanceShiftDetail[] };
  reviewRequestedAt?: string | null;
  reviewRequestNote?: string | null;
  reviewResponse?: string | null;
  reviewDeadline?: string | null;
}

// ── Hợp đồng lao động (nhân viên chỉ xem của mình; Admin quản lý trên web) ───────────

export type EmploymentContractType = 'Probation' | 'FixedTermUnder12Months' | 'FixedTerm12To36Months' | 'Indefinite' | 'Appendix';
export type EmploymentContractStatus = 'Draft' | 'AwaitingSignature' | 'Signed' | 'Terminated' | 'Voided';

export const CONTRACT_TYPE_LABEL: Record<EmploymentContractType, string> = {
  Probation: 'Thử việc',
  FixedTermUnder12Months: 'Xác định thời hạn dưới 12 tháng',
  FixedTerm12To36Months: 'Xác định thời hạn 12–36 tháng',
  Indefinite: 'Không xác định thời hạn',
  Appendix: 'Phụ lục hợp đồng',
};

export const CONTRACT_STATUS_LABEL: Record<EmploymentContractStatus, string> = {
  Draft: 'Nháp',
  AwaitingSignature: 'Chờ ký giấy',
  Signed: 'Đã ký',
  Terminated: 'Đã chấm dứt',
  Voided: 'Đã huỷ',
};

export interface IEmploymentContract {
  id: string;
  contractNumber?: string | null;
  contractType: EmploymentContractType;
  startDate: string;
  endDate?: string | null;
  jobTitle: string;
  renderedBody: string;
  status: EmploymentContractStatus;
  signedOn?: string | null;
  terminatedOn?: string | null;
  files: { id: string; url: string; contentType: string; uploadedAt: string }[];
}

// ── Ca hỗ trợ mở trên chợ ca ─────────────────────────────────────────────

export type SupportShiftOpeningStatus = 'Open' | 'Filled' | 'Cancelled';
export type SupportShiftClaimStatus = 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn';

export const SUPPORT_CLAIM_STATUS_LABEL: Record<SupportShiftClaimStatus, string> = {
  Pending: 'Chờ duyệt',
  Approved: 'Đã duyệt',
  Rejected: 'Từ chối',
  Withdrawn: 'Đã rút',
};

export interface ISupportShiftClaim {
  id: string;
  staffId: string;
  staffName: string;
  status: SupportShiftClaimStatus;
  note?: string | null;
  reviewNote?: string | null;
  createdAt: string;
}

/** Người không có quyền xếp ca chỉ nhận về đơn của chính mình trong `claims`. */
export interface ISupportShiftOpening {
  id: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  date: string;
  slots: number;
  approvedCount: number;
  note?: string | null;
  status: SupportShiftOpeningStatus;
  fixedHourlyRate?: number | null;
  minimumPaidHours?: number | null;
  claims: ISupportShiftClaim[];
}

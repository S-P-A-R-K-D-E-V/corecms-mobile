// ----------------------------------------------------------------------
// Kiểm tra cửa hàng — khớp core-be CoreCms.Contracts/StoreInspection/StoreInspectionContracts.cs (phần app dùng).
// ----------------------------------------------------------------------

export type InspectionType = 'ShiftQuick' | 'WeeklyFull';
/** Mandatory = mục B (sửa trong 15 phút); Standard = mục T (sửa trong ca). */
export type InspectionLevel = 'Mandatory' | 'Standard';
export type InspectionStatus = 'Draft' | 'Submitted';
export type InspectionOutcome = 'Pass' | 'Fail' | 'NotApplicable';
export type InspectionZoneCode = 'A' | 'B' | 'C' | 'D';
/** Khung ca (ShiftTemplate.CleaningBlock). */
export type ShiftBlock = 'Morning' | 'Afternoon' | 'Evening';

export const INSPECTION_TYPE_LABEL: Record<InspectionType, string> = {
  ShiftQuick: 'Kiểm nhanh',
  WeeklyFull: 'Kiểm tuần',
};

export const INSPECTION_OUTCOME_LABEL: Record<InspectionOutcome, string> = {
  Pass: 'Đạt',
  Fail: 'Không đạt',
  NotApplicable: 'NA',
};

export interface IInspectionTemplateItem {
  id: string;
  code: string;
  groupName: string | null;
  title: string;
  passCriteria: string;
  level: InspectionLevel;
  zones: InspectionZoneCode[];
  perStaff: boolean;
  observationsPerStaff: number;
  requiresPhotoOnFail: boolean;
  requiresFix: boolean;
  sortOrder: number;
  /** Nhân viên trong ca tự làm và chụp ảnh (bảng mỗi ca). Backend cũ không có → coi như false. */
  staffDoes?: boolean;
  /** 1 = Thứ 2 … 7 = Chủ nhật; null / rỗng = mọi ngày. */
  weekdays?: number[] | null;
  /** Khung ca: Morning | Afternoon | Evening; null / rỗng = mọi ca. */
  blocks?: ShiftBlock[] | null;
}

export interface IInspectionPhoto {
  id: string;
  kind: 'Fault' | 'Fixed';
  url: string;
  uploadedAt: string;
}

export interface IInspectionResult {
  id: string;
  itemId: string;
  itemCode: string;
  level: InspectionLevel;
  observedStaffId: string | null;
  observationIndex: number;
  outcome: InspectionOutcome;
  note: string | null;
  responsibleStaffId: string | null;
  zoneUnassigned: boolean;
  recordedAt: string;
  fixDeadlineAt: string | null;
  fixedAt: string | null;
  fixNote: string | null;
  isOverdue: boolean;
  photos: IInspectionPhoto[];
}

export interface IInspection {
  summary: {
    id: string;
    type: InspectionType;
    status: InspectionStatus;
    date: string;
    shiftScheduleId: string;
    shiftName: string;
    startTime: string;
    endTime: string;
    isSpotCheck: boolean;
    inspectorId: string;
    inspectorName: string;
    submittedAt: string | null;
    passCount: number;
    failCount: number;
    notApplicableCount: number;
  };
  note: string | null;
  zoneOwners: {
    zones: Partial<Record<InspectionZoneCode, string>>;
    shiftLeadId: string | null;
    staff: { staffId: string; name: string }[];
  };
  template: { id: string; type: InspectionType; version: number; name: string; items: IInspectionTemplateItem[] };
  results: IInspectionResult[];
  /** Hạng mục nhân viên đã làm trong ca (ai làm, ảnh) — backend cũ không có. */
  completions?: { itemId: string; completion: IShiftWorkCompletion }[];
}

export interface IInspectionResultInput {
  itemId: string;
  observedStaffId: string | null;
  observationIndex: number;
  outcome: InspectionOutcome;
  note: string | null;
  faultPhotoKeys: string[] | null;
}

export interface IInspectionShift {
  date: string;
  shiftScheduleId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  shiftType: 'Main' | 'Extra';
  branchId: string | null;
  staffCount: number;
  shiftLeadId: string | null;
  shiftLeadName: string | null;
  iAmOnShift: boolean;
  iAmShiftLead: boolean;
  quickInspectionId: string | null;
  quickStatus: InspectionStatus | null;
  spotChecks: number;
}

export interface IInspectionFault {
  resultId: string;
  inspectionId: string;
  inspectionType: InspectionType;
  date: string;
  shiftName: string;
  itemCode: string;
  itemTitle: string;
  passCriteria: string;
  level: InspectionLevel;
  requiresPhotoOnFail: boolean;
  note: string | null;
  fixDeadlineAt: string | null;
  fixedAt: string | null;
  fixNote: string | null;
  isOverdue: boolean;
  photos: IInspectionPhoto[];
}

// ----------------------------------------------------------------------
// Công việc trong ca — khớp core-be ShiftWorkController (shift-work/*): hạng mục bảng mỗi ca có cờ "nhân viên tự làm",
// người trong ca làm xong chụp ảnh; người kiểm thấy khi chấm.
// ----------------------------------------------------------------------

/** Ảnh việc đã làm (kho riêng tư, link có chữ ký). */
export interface IShiftWorkPhoto {
  id: string;
  kind: string;
  url: string;
  uploadedAt: string;
}

export interface IShiftWorkCompletion {
  id: string;
  completedByUserId: string;
  completedByName: string;
  completedAt: string;
  note: string | null;
  photos: IShiftWorkPhoto[];
}

export interface IShiftWorkItem {
  itemId: string;
  code: string;
  groupName: string | null;
  title: string;
  passCriteria: string;
  zones: InspectionZoneCode[];
  requiresPhoto: boolean;
  completion: IShiftWorkCompletion | null;
  /** Kết quả kiểm của ca cho hạng mục này; null = chưa kiểm. */
  outcome: InspectionOutcome | null;
}

export interface IShiftWorkShift {
  date: string;
  shiftScheduleId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  block: ShiftBlock | null;
  items: IShiftWorkItem[];
}

// ── Sửa tận gốc (corrective-actions) ───────────────────────────────────

export type CorrectiveActionStatus = 'Suggested' | 'Open' | 'Done' | 'Dismissed';

export interface ICorrectiveAction {
  id: string;
  itemCode: string | null;
  title: string;
  rootCause: string | null;
  action: string | null;
  ownerUserId: string | null;
  dueDate: string | null;
  status: CorrectiveActionStatus;
  suggestedForWeek: string | null;
  failCount: number | null;
  createdAt: string;
  completedAt: string | null;
  ownerName?: string | null;
}

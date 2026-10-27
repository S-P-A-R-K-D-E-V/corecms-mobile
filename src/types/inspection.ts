// ----------------------------------------------------------------------
// Kiểm tra cửa hàng — khớp core-be CoreCms.Contracts/StoreInspection/StoreInspectionContracts.cs (phần app dùng).
// ----------------------------------------------------------------------

export type InspectionType = 'ShiftQuick' | 'WeeklyFull';
/** Mandatory = mục B (sửa trong 15 phút); Standard = mục T (sửa trong ca). */
export type InspectionLevel = 'Mandatory' | 'Standard';
export type InspectionStatus = 'Draft' | 'Submitted';
export type InspectionOutcome = 'Pass' | 'Fail' | 'NotApplicable';
export type InspectionZoneCode = 'A' | 'B' | 'C' | 'D';

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

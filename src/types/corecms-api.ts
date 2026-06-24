// ======================================================================
// Auth
// ======================================================================

export interface ILoginRequest {
  email: string;
  password: string;
}

export interface IRegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface ILogoutRequest {
  userId: string;
}

export interface IVerifyOtpRequest {
  email: string;
  otpCode: string;
}

export interface IResendOtpRequest {
  email: string;
}

export interface IRestoreSessionRequest {
  sessionToken: string;
}

export interface IAuthResponse {
  token: string;
  refreshToken: string;
  sessionToken?: string;
  requiresOtpVerification?: boolean;
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  roles: string[];
  permissions: string[];
}

// ======================================================================
// User
// ======================================================================

export interface IUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phoneNumber?: string;
  address?: string;
  bankCode?: string;
  bankNo?: string;
  avatarUrl?: string;
  profileImageUrl?: string;
  idCardFrontUrl?: string;
  idCardBackUrl?: string;
  role: string;
  roles: string[];
  permissions: string[];
  isActive: boolean;
  createdAt: string;
}

export interface IUpdateProfileRequest {
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  address?: string;
  bankCode?: string;
  bankNo?: string;
  profileImageUrl?: string;
}

export interface IChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ======================================================================
// Branch
// ======================================================================

export interface IBranchLocation {
  id: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  wifiSSIDs?: string[];
  ipWhitelist?: string[];
}

// ======================================================================
// Shift Templates
// ======================================================================

export interface IShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  color?: string;
  isActive: boolean;
}

// ======================================================================
// Shift Assignment
// ======================================================================

export interface IShiftAssignment {
  id: string;
  staffId: string;
  staffName: string;
  shiftTemplateId: string;
  shiftTemplateName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'Scheduled' | 'Present' | 'Absent' | 'Late';
  note?: string;
}

// Maps to MyScheduleResponse from the API — richer than IShiftAssignment
export interface IMyScheduleItem {
  assignmentId: string;
  shiftScheduleId: string;
  shiftName: string;
  shiftType: string;
  date: string;       // "yyyy-MM-dd"
  startTime: string;  // "HH:mm"
  endTime: string;    // "HH:mm"
  totalHours: number;
  checkInAllowedMinutesBefore: number;
  note?: string;
  hasCheckedIn: boolean;
  hasCheckedOut: boolean;
  checkInTime?: string;
  checkOutTime?: string;
  workedHours?: number;
}

// ======================================================================
// Shift Schedule (versioned shift definition used for registration)
// ======================================================================

export interface IShiftSchedule {
  id: string;
  shiftTemplateId: string;
  templateName: string;
  color: string;
  startTime: string;   // "HH:mm"
  endTime: string;     // "HH:mm"
  fromDate: string;    // "yyyy-MM-dd"
  toDate?: string;     // "yyyy-MM-dd"
  repeatDays: number;  // WeekDays bitmask: Mon=1,Tue=2,Wed=4,Thu=8,Fri=16,Sat=32,Sun=64
  isActive: boolean;
}

// ======================================================================
// Shift Registration
// ======================================================================

export interface IShiftRegistration {
  id: string;
  staffId: string;
  shiftScheduleId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  date: string;
  note?: string;
  createdAt: string;
}

export interface IRegisterShiftRequest {
  shiftScheduleId: string;
  date: string;
  note?: string;
}

export interface IUnregisterShiftRequest {
  shiftScheduleId: string;
  date: string;
}

// ======================================================================
// Attendance
// ======================================================================

export interface IAttendanceLog {
  id: string;
  staffId: string;
  staffName: string;
  shiftAssignmentId?: string;
  checkInTime?: string;
  checkOutTime?: string;
  checkInLatitude?: number;
  checkInLongitude?: number;
  checkOutLatitude?: number;
  checkOutLongitude?: number;
  checkInIP?: string;
  checkOutIP?: string;
  isLate: boolean;
  lateMinutes: number;
  status: 'CheckedIn' | 'CheckedOut' | 'AutoClosed';
  note?: string;
  faceVerified?: boolean;
  date: string;
}

export interface ICheckInRequest {
  shiftAssignmentId?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  ipAddress?: string;
  note?: string;
  faceImageBase64?: string;
  faceVerified?: boolean;
  isOvertime?: boolean;
}

export interface ICheckOutRequest {
  attendanceLogId: string;
  latitude?: number;
  longitude?: number;
  ipAddress?: string;
  note?: string;
}

export interface ISmartCheckInRequest {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  ipAddress?: string;
  wifiName?: string;
  faceVerified: boolean;
}

export interface ISmartCheckOutRequest {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  ipAddress?: string;
  wifiName?: string;
  faceVerified?: boolean;
}

export interface IAttendanceRequest {
  id: string;
  staffId: string;
  staffName: string;
  type: 'AdjustCheckIn' | 'AdjustCheckOut' | 'LeaveRequest';
  requestedCheckIn?: string;
  requestedCheckOut?: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reviewedBy?: string;
  reviewNote?: string;
  createdAt: string;
}

export interface ICreateAttendanceRequestDto {
  type: 'AdjustCheckIn' | 'AdjustCheckOut' | 'LeaveRequest';
  attendanceLogId?: string;
  requestedCheckIn?: string;
  requestedCheckOut?: string;
  reason: string;
}

export interface IProcessAttendanceRequestDto {
  status: 'Approved' | 'Rejected';
  reviewNote?: string;
}

export interface ICheckinFaceRequest {
  candidateName: string;
  imageBase64: string;
  lat?: number;
  lng?: number;
  time?: string;
}

export interface ICheckinFaceResponse {
  id: string;
  candidateName: string;
  checkinTime: string;
  notificationSent: boolean;
}

export interface IAttendanceReport {
  staffId: string;
  staffName: string;
  totalShifts: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
}

// ======================================================================
// Payroll
// ======================================================================

export interface IPayrollRecord {
  id: string;
  staffId: string;
  staffName: string;
  cycleId: string;
  cycleName: string;
  periodStart: string;
  periodEnd: string;
  totalShiftsScheduled: number;
  totalShiftsPresent: number;
  totalShiftsAbsent: number;
  totalHoursWorked: number;
  totalOvertimeHours: number;
  baseSalary: number;
  overtimeSalary: number;
  bonus: number;
  deductions: number;
  penaltyAmount: number;
  totalSalary: number;
  status: 'Draft' | 'Finalized';
  finalizedAt?: string;
  note?: string;
}

export interface IPayrollShiftDetailResponse {
  payrollRecordId: string;
  shifts: Array<{
    date: string;
    shiftName: string;
    scheduledStart: string;
    scheduledEnd: string;
    actualCheckIn?: string;
    actualCheckOut?: string;
    hoursWorked: number;
    overtimeHours: number;
    isLate: boolean;
    lateMinutes: number;
    status: string;
  }>;
}

// ======================================================================
// Payroll Calculation (admin)
// ======================================================================

export interface IPayrollCalculationRequest {
  staffId: string;
  cycleId: string;
}

export interface IBatchPayrollCalculationRequest {
  cycleId: string;
  staffIds?: string[];
}

export interface IBatchPayrollResponse {
  count: number;
  records: IPayrollRecord[];
}

export interface IFinalizePayrollRequest {
  note?: string;
}

export interface IPayrollCycleDetailResponse {
  cycleId: string;
  cycleName: string;
  periodStart: string;
  periodEnd: string;
  records: IPayrollRecord[];
  totalPayroll: number;
}

export interface IWaivePenaltyRequest {
  payrollRecordId: string;
  reason: string;
}

export interface IWaivePenaltyResponse {
  id: string;
  payrollRecordId: string;
  reason: string;
  waivedAt: string;
}

// ======================================================================
// Salary
// ======================================================================

// ======================================================================
// Shift Swap (Đổi ca)
// ======================================================================

export interface IShiftSwapRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  currentShiftAssignmentId: string;
  currentShiftName: string;
  currentShiftDate: string;
  targetUserId?: string;
  targetUserName?: string;
  targetShiftAssignmentId?: string;
  targetShiftName?: string;
  targetShiftDate?: string;
  reason?: string;
  status: string;
  reviewedBy?: string;
  reviewerName?: string;
  reviewedAt?: string;
  reviewNote?: string;
  targetConfirmedAt?: string;
  targetDeclineReason?: string;
  createdAt: string;
}

export interface ICreateShiftSwapRequestRequest {
  currentShiftAssignmentId: string;
  targetUserId: string;
  targetShiftAssignmentId?: string;
  reason?: string;
}

export interface IConfirmShiftSwapTargetRequest {
  isAccepted: boolean;
  declineReason?: string;
}

// ======================================================================
// Shift Pool (Đổi ca & làm hộ hợp nhất)
// ======================================================================

export type PoolNeedType = 'Swap' | 'FullCover' | 'PartialCover';
export type PoolPostStatus = 'Open' | 'WaitingApproval' | 'Approved' | 'Cancelled';
export type PartialCoverSide = 'LateArrive' | 'EarlyLeave';

export interface IShiftPoolPost {
  id: string;
  posterId: string;
  posterName: string;
  shiftAssignmentId: string;
  shiftName: string;
  shiftDate: string;
  shiftStartTime: string;
  shiftEndTime: string;
  needType: PoolNeedType;
  partialSide?: PartialCoverSide;
  partialStartTime?: string;
  partialEndTime?: string;
  note?: string;
  status: PoolPostStatus;
  claimerId?: string;
  claimerName?: string;
  claimerOfferedAssignmentId?: string;
  claimerOfferedShiftName?: string;
  claimerOfferedShiftDate?: string;
  claimerAdjacentAssignmentId?: string;
  claimedAt?: string;
  coveringHours?: number;
  hourlyRate?: number;
  extraPayAmount?: number;
  actualCoverStart?: string;
  actualCoverEnd?: string;
  reviewedBy?: string;
  reviewerName?: string;
  reviewedAt?: string;
  reviewNote?: string;
  lastClaimRejectedNote?: string;
  lastClaimRejectedAt?: string;
  createdAt: string;
}

export interface ICreateShiftPoolPostDto {
  shiftAssignmentId: string;
  needType: PoolNeedType;
  partialSide?: PartialCoverSide;   // bắt buộc khi PartialCover (thay cho set giờ)
  partialStartTime?: string;        // [deprecated]
  partialEndTime?: string;          // [deprecated]
  note?: string;
}

export interface IClaimShiftPoolPostDto {
  offeredAssignmentId?: string;
}

export interface IReviewShiftPoolPostDto {
  action: string; // "Approve" | "RejectClaim"
  reviewNote?: string;
}

export interface ISalaryConfiguration {
  id: string;
  staffId: string;
  staffName: string;
  baseSalary: number;
  hourlyRate?: number;
  overtimeMultiplier: number;
  effectiveFrom: string;
  effectiveTo?: string;
}

// ----------------------------------------------------------------------
// Shift Cash (Kiểm tiền quầy) — port từ core-fe corecms-api.ts
// ----------------------------------------------------------------------

export interface IShiftCashTransaction {
  id: string;
  date: string;
  type: 'Thu' | 'Chi';
  amount: number;
  note?: string;
  isDeleted: boolean;
  createdByName?: string;
  createdAt: string;
  updatedByName?: string;
  updatedAt?: string;
}

export interface IShiftCashDenomination {
  id: string;
  date: string;
  denomination: number;
  quantity: number;
  total: number;
  lastModifiedByName?: string;
  lastModifiedAt: string;
}

export interface IShiftCashFinalization {
  id: string;
  openingBalance: number;
  closingBalance: number;
  /** Chênh tiền tổng tại thời điểm chốt (dương = thừa, âm = thiếu). */
  difference: number;
  finalizedAt?: string;
  finalizedByName?: string;
}

export interface IShiftCashSummary {
  date: string;
  openingBalance: number;
  totalCashFromKiot: number;
  manualIncome: number;
  manualExpense: number;
  expectedClosing: number;
  actualCash: number;
  difference: number;
  isFinalized: boolean;
  finalizedAt?: string;
  finalizedByName?: string;
  denominations: IShiftCashDenomination[];
  transactions: IShiftCashTransaction[];
  finalizations: IShiftCashFinalization[];
}

export interface IAddShiftCashTransactionRequest {
  date: string;
  type: 'Thu' | 'Chi';
  amount: number;
  note?: string;
}

export interface IUpdateShiftCashTransactionRequest {
  amount: number;
  note?: string;
}

export interface IDenominationItem {
  denomination: number;
  quantity: number;
}

export interface IUpdateDenominationBatchRequest {
  date: string;
  items: IDenominationItem[];
}

export interface IFinalizeShiftCashRequest {
  date: string;
  items: IDenominationItem[];
}

// --- KiotViet (chỉ phần tổng hợp cần cho mobile) ---

export interface IKiotVietDailySummary {
  date: string;
  totalInvoices: number;
  totalRevenue: number;
  totalCash: number;
  totalBank: number;
  totalCard: number;
  totalReturns: number;
  netCashImpact: number;
}

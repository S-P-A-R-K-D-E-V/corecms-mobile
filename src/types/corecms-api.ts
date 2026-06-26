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

/** Chi nhánh/cửa hàng — khớp BE BranchResponse (camelCase). */
export interface IBranchLocation {
  id: string;
  kiotVietId?: number;
  branchName: string;
  branchCode?: string;
  contactNumber?: string;
  email?: string;
  address?: string;
  retailerId?: number;
  latitude?: number;
  longitude?: number;
  /** Bán kính geofence (mét) — dùng để xác định có đang ở cửa hàng. */
  geofenceRadius: number;
  isActive: boolean;
  createdDate: string;
  modifiedDate?: string;
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

/** Báo cáo chấm công 1 nhân viên trong khoảng — khớp BE AttendanceReportResult.
 *  Lưu ý: endpoint /attendance/my-report trả về MẢNG (1 phần tử cho 1 NV). */
export interface IAttendanceReport {
  staffId: string;
  staffName: string;
  period: string;
  totalWorkedHours: number;
  compensationHours: number;
  /** Số ca được phân trong khoảng. */
  totalShifts: number;
  /** Số ca đã có mặt (có log chấm công). */
  presentShifts: number;
  /** Số ca vắng mặt. */
  absentShifts: number;
  /** Số ca đi muộn. */
  lateCount: number;
  totalLateMinutes: number;
  overtimeHours: number;
  earlyLeaveCount: number;
}

// ======================================================================
// Payroll
// ======================================================================

/** Tóm tắt thanh toán gần nhất của một bảng lương (khớp BE PayrollPaymentSummary). */
export interface IPayrollPaymentSummary {
  paymentId: string;
  status: string;
  amount: number;
  paidAt: string;
  transactionRef?: string;
}

/** Bảng lương 1 kỳ — khớp BE PayrollRecordResponse (camelCase). */
export interface IPayrollRecord {
  id: string;
  payrollCycleId?: string;
  userId: string;
  userName: string;
  periodMonth: string;
  fromDate: string;
  toDate: string;
  totalShifts: number;
  presentShifts: number;
  totalHoursWorked: number;
  overtimeHours: number;
  wrongShifts: number;
  totalLateMinutes: number;
  absentShifts: number;
  baseSalary: number;
  overtimeSalary: number;
  bonus: number;
  penaltyAmount: number;
  deduction: number;
  totalSalary: number;
  note?: string;
  isFinalized: boolean;
  finalizedBy?: string;
  finalizedAt?: string;
  createdAt: string;
  payment?: IPayrollPaymentSummary | null;
}

/** Chi tiết 1 ca trong bảng lương — khớp BE PayrollShiftItemResponse. */
export interface IPayrollShiftItem {
  shiftAssignmentId: string;
  date: string;
  shiftName: string;
  shiftStartTime: string;
  shiftEndTime: string;
  checkInTime?: string;
  checkOutTime?: string;
  workedHours: number;
  paidHours: number;
  lateMinutes: number;
  /** 'Present' | 'Absent' | 'Wrong' (chuỗi từ BE). */
  status: string;
  isWaived: boolean;
  waiverId?: string;
  waiverReason?: string;
  isHolidayShift: boolean;
}

export interface IPayrollShiftDetailResponse {
  payrollRecordId: string;
  userId: string;
  userName: string;
  periodMonth: string;
  fromDate: string;
  toDate: string;
  shifts: IPayrollShiftItem[];
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

/** Toạ độ GPS tuỳ chọn gửi kèm thao tác kiểm tiền (ghi vào audit ở BE). */
export interface IShiftCashGeoStamp {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
}

export interface IAddShiftCashTransactionRequest extends IShiftCashGeoStamp {
  date: string;
  type: 'Thu' | 'Chi';
  amount: number;
  note?: string;
}

export interface IUpdateShiftCashTransactionRequest extends IShiftCashGeoStamp {
  amount: number;
  note?: string;
}

export interface IDenominationItem {
  denomination: number;
  quantity: number;
}

export interface IUpdateDenominationBatchRequest extends IShiftCashGeoStamp {
  date: string;
  items: IDenominationItem[];
}

export interface IFinalizeShiftCashRequest extends IShiftCashGeoStamp {
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

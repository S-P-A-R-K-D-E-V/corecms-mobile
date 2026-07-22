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
  /** Mức ưu tiên xếp ca (⭐) — cao hơn được xếp trước khi phân công tự động. */
  schedulingPriority?: number;
  /** Trạng thái tài khoản (BE trả về; isActive suy từ status='Active'). */
  status?: UserStatus;
  createdAt: string;
}

export type UserStatus = 'Active' | 'Pending' | 'Banned' | 'Rejected';

export interface IVietQRBank {
  id: number;
  name: string;
  code: string;
  bin: string;
  shortName: string;
  logo: string;
  transferSupported: number;
  lookupSupported: number;
}

export interface IChangeUserStatusRequest {
  status: UserStatus;
}

/** Vai trò — khớp BE RoleResponse (permissions rút gọn). */
export interface IRole {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  userCount: number;
  permissions: { id: string; name: string; description?: string }[];
}

export interface IAssignRoleRequest {
  userId: string;
  roleIds: string[];
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

/** Khớp BE ShiftAssignmentScheduleResponse (GET /shift-assignments/range). */
export interface IShiftAssignment {
  id: string;
  staffId: string;
  staffName: string;
  /** Legacy — BE luôn trả null ở hệ mới. */
  shiftId?: string | null;
  shiftScheduleId?: string | null;
  shiftName: string;
  startTime: string;  // "HH:mm"
  endTime: string;    // "HH:mm"
  shiftType: string;
  date: string;       // "yyyy-MM-dd"
  note?: string;
  isNewSystem: boolean;
  createdAt: string;
  /** Log chấm công mới nhất của ca (null nếu chưa checkin). */
  attendanceLog?: IAttendanceLog | null;
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

/** Khớp BE AttendanceRequestType — KHÔNG có "LeaveRequest" (chưa có tính năng
 *  xin nghỉ phép ở BE). ShiftSwap có luồng riêng qua /shift-swap/*, không tạo
 *  qua endpoint này. */
export type AttendanceRequestType = 'MissedCheckIn' | 'MissedCheckOut' | 'OvertimeCompensation' | 'ShiftSwap';

export interface IAttendanceRequest {
  id: string;
  staffId: string;
  staffName: string;
  shiftAssignmentId?: string;
  requestType: AttendanceRequestType;
  status: 'Pending' | 'Approved' | 'Rejected';
  reason: string;
  requestedCheckInTime?: string;
  requestedCheckOutTime?: string;
  compensationHours?: number;
  targetStaffId?: string;
  targetStaffName?: string;
  targetShiftAssignmentId?: string;
  approvedById?: string;
  approvedByName?: string;
  approvedAt?: string;
  approvalNote?: string;
  createdAt: string;
}

export interface ICreateAttendanceRequestDto {
  shiftAssignmentId?: string;
  requestType: AttendanceRequestType;
  reason: string;
  requestedCheckInTime?: string;
  requestedCheckOutTime?: string;
  compensationHours?: number;
  targetStaffId?: string;
  targetShiftAssignmentId?: string;
}

export interface IProcessAttendanceRequestDto {
  status: 'Approved' | 'Rejected';
  approvalNote?: string;
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

/** Loại vi phạm có thể bỏ qua lỗi (khớp BE ViolationType). */
export type WaivableViolationType = 'Late' | 'EarlyLeave' | 'WrongShift' | 'Absent';

/** POST /payroll/waive-penalty — bỏ qua lỗi vi phạm 1 ca của 1 nhân viên. */
export interface IWaivePenaltyRequest {
  shiftAssignmentId: string;
  userId: string;
  violationType: WaivableViolationType;
  payrollCycleId?: string;
  reason?: string;
}

export interface IWaivePenaltyResponse {
  id: string;
  shiftAssignmentId: string;
  userId: string;
  userName: string;
  waivedViolationType: string;
  reason?: string;
  waivedBy: string;
  waivedByName: string;
  createdAt: string;
}

// ======================================================================
// Payroll Calculation (admin)
// ======================================================================

export interface IPayrollCalculationRequest {
  staffId: string;
  cycleId: string;
}

// Khớp BE PayrollContracts (đối chiếu contract, KHÔNG tin type FE cũ vốn lệch).

/** Chu kỳ lương — khớp BE PayrollCycleResponse. */
export interface IPayrollCycle {
  id: string;
  name: string;
  cycleType: string; // 'Monthly' | 'Custom'
  fromDate: string;  // "yyyy-MM-dd"
  toDate: string;
  standardWorkDays: number;
  isLocked: boolean;
  /** false = staff không thấy bảng lương của chu kỳ này ở my-payroll. */
  isVisibleToStaff: boolean;
  lockedBy?: string;
  lockerName?: string;
  lockedAt?: string;
  createdAt: string;
}

export interface ICreatePayrollCycleRequest {
  name: string;
  cycleType: string;
  fromDate: string; // "yyyy-MM-dd"
  toDate: string;
  standardWorkDays: number;
}

/** Tính lương 1 nhân viên trong khoảng. */
export interface IPayrollCalculationRequest {
  userId: string;
  fromDate: string; // "yyyy-MM-dd"
  toDate: string;
}

/** Tạo bảng lương hàng loạt cho cả kỳ (tạo cycle + tính mọi NV). */
export interface IBatchPayrollCalculationRequest {
  periodName: string;
  fromDate: string; // "yyyy-MM-dd"
  toDate: string;
}

export interface IBatchPayrollResponse {
  payrollCycleId: string;
  periodName: string;
  fromDate: string;
  toDate: string;
  totalEmployees: number;
  successCount: number;
  skippedCount: number;
  records: IPayrollRecord[];
}

export interface IFinalizePayrollRequest {
  isFinalized: boolean;
}

/** POST /payroll/bulk-finalize — chốt/bỏ chốt hàng loạt. */
export interface IBulkFinalizePayrollRequest {
  payrollIds: string[];
  isFinalized: boolean;
}

export interface IBulkFinalizeError {
  payrollId: string;
  reason: string;
}

export interface IBulkFinalizePayrollResponse {
  successCount: number;
  failedCount: number;
  errors: IBulkFinalizeError[];
}

// --- Cấu hình lương cá nhân (khớp BE SalaryConfigurationContracts) ---

export type SalaryType = 'PerShift' | 'Hourly' | 'Monthly';

export interface ISalaryConfiguration {
  id: string;
  userId: string;
  userName: string;
  salaryType: string;
  amount: number;
  probationRate?: number;
  effectiveFrom: string;  // "yyyy-MM-dd"
  effectiveTo?: string;
  note?: string;
  createdAt: string;
}

/** POST /salary-configurations/versioned-upsert — đặt mức lương hiệu lực từ ngày. */
export interface IVersionedUpsertSalaryConfigRequest {
  userId: string;
  salaryType: SalaryType;
  amount: number;
  probationRate?: number;
  effectiveFrom: string; // "yyyy-MM-dd"
  note?: string;
}

// --- Preview cấu hình lương (GET /payroll/salary-config-preview?fromDate=) ---

export interface ISalaryConfigSummary {
  id: string;
  salaryType: string;
  amount: number;
  probationRate?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  note?: string;
}

export interface ISalaryConfigPreviewItem {
  userId: string;
  userName: string;
  hasActiveConfig: boolean;
  activeConfig?: ISalaryConfigSummary;
  isStaff?: boolean;
}

// --- Thanh toán lương (QR + đánh dấu đã trả) ---

/** GET /payroll/{id}/payment/prepare — thông tin để dựng QR VietQR. */
export interface IPreparePayrollPaymentResponse {
  payrollId: string;
  userFullName: string;
  amount: number;
  computedAmount: number;
  bankAccount?: string;
  bankCode?: string;
  accountName?: string;
  suggestedContent: string;
  canPay: boolean;
  missingInfoReason?: string;
}

/** POST /payroll/{id}/mark-paid. */
export interface IMarkPayrollPaidRequest {
  amount: number;
  computedAmount: number;
  content: string;
  transactionRef?: string;
  note?: string;
}

export interface IPayrollPaymentDetail {
  id: string;
  payrollRecordId: string;
  status: 'Paid' | 'Unpaid' | 'Failed';
  amount: number;
  bankAccount: string;
  bankCode: string;
  accountName: string;
  content: string;
  transactionRef?: string;
  note?: string;
  paidBy: string;
  paidByName: string;
  paidAt: string;
  createdAt: string;
}

export interface IPayrollCycleDetailResponse {
  cycleId: string;
  cycleName: string;
  fromDate: string;
  toDate: string;
  isLocked: boolean;
  /** false = staff không thấy bảng lương của chu kỳ này ở my-payroll. */
  isVisibleToStaff: boolean;
  records: IPayrollRecord[];
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

// ======================================================================
// Manager — xếp ca / đổi ca hộ (khớp BE ShiftAssignmentContracts)
// ======================================================================

/** Body POST /shift-assignments/manage-shift — danh sách staffIds trở thành
 *  tập phân công của (schedule, ngày); BE tự tính thêm/gỡ. */
export interface IManageShiftAssignmentsRequest {
  shiftScheduleId: string;
  date: string; // "yyyy-MM-dd"
  staffIds: string[];
}

/** Body POST /shift-assignments/bulk — phân công hàng loạt 1 ca cho nhiều
 *  nhân viên qua khoảng ngày. FilterDays = WeekDays bitmask (int) hoặc bỏ
 *  trống để áp mọi ngày ca lặp lại; Overwrite = gỡ NV không được chọn. */
export interface IBulkAssignShiftScheduleRequest {
  staffIds: string[];
  shiftScheduleId: string;
  fromDate: string; // "yyyy-MM-dd"
  toDate: string;   // "yyyy-MM-dd"
  filterDays?: number;
  overwrite?: boolean;
}

/** Body POST /attendance/manual-adjustment — Manager/Admin điều chỉnh giờ
 *  chấm công của 1 nhân viên trên 1 ca. */
export interface IManualAttendanceAdjustmentRequest {
  shiftAssignmentId: string;
  staffId: string;
  checkInTime?: string;  // ISO; bỏ trống = giữ nguyên
  checkOutTime?: string;
  note?: string;
}

/** PUT /attendance/adjust-time — CẬP NHẬT log chấm công của 1 ca (tạo nếu chưa
 *  có). checkInTime/checkOutTime là ISO UTC (có Z); null = xoá giá trị đó. */
export interface IAdjustAttendanceTimeRequest {
  shiftAssignmentId: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  note?: string;
}

/** 1 slot đề xuất phân công tự động (khớp BE AutoAssignSlotDto). */
export interface IAutoAssignSlotDto {
  scheduleId: string;
  date: string; // "yyyy-MM-dd"
  staffIds: string[];
}

/** Body POST /shift-assignments/auto-assign-apply. */
export interface IApplyAutoAssignRequest {
  slots: IAutoAssignSlotDto[];
}

/** Body POST /shift-assignments/swap — hoán đổi 2 phân công. */
export interface ISwapShiftAssignmentsRequest {
  staffId1: string;
  shiftScheduleId1: string;
  date1: string;
  staffId2: string;
  shiftScheduleId2: string;
  date2: string;
}

// ======================================================================
// Manager — duyệt yêu cầu (đồng bộ core-fe corecms-api)
// ======================================================================

/** Body duyệt/từ chối yêu cầu đổi ca — PUT /shift-swap/{id}/review. */
export interface IReviewShiftSwapRequestRequest {
  status: string; // "Approved" | "Rejected"
  reviewNote?: string;
}

/** Yêu cầu làm hộ ca (đi muộn) — khớp BE LateCoverRequestResponse. */
export interface ILateCoverRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  lateStaffId: string;
  lateStaffName: string;
  coveringStaffId: string;
  coveringStaffName: string;
  lateStaffAssignmentId: string;
  lateShiftName: string;
  lateShiftDate: string;
  coveringStaffAssignmentId: string;
  coveringShiftName: string;
  coveringShiftDate: string;
  coveringStartTime: string;
  coveringEndTime: string;
  coveringHours: number;
  lateStaffHourlyRate: number;
  extraPayAmount: number;
  reason?: string;
  status: string;
  reviewedBy?: string;
  reviewerName?: string;
  reviewedAt?: string;
  reviewNote?: string;
  createdAt: string;
}

/** Body duyệt/từ chối yêu cầu làm hộ — PUT /late-cover/{id}/review. */
export interface IReviewLateCoverRequestDto {
  status: string; // "Approved" | "Rejected"
  reviewNote?: string;
}

// ======================================================================
// Reports / Admin Dashboard (khớp BE /reports/*, đồng bộ core-fe corecms-api)
// ======================================================================

export interface ITopSellingProduct {
  productId: string;
  productName: string;
  productSKU: string;
  quantitySold: number;
  revenue: number;
}

export interface IRecentOrder {
  id: string;
  orderNumber: string;
  customerName?: string;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

/** Tổng quan bảng điều khiển — nguồn cho dashboard Quản trị. */
export interface IDashboardSummary {
  todayRevenue: number;
  todayOrders: number;
  monthRevenue: number;
  monthOrders: number;
  totalProducts: number;
  totalCustomers: number;
  lowStockCount: number;
  topSellingProducts: ITopSellingProduct[];
  recentOrders: IRecentOrder[];
}

export interface IRevenuePeriod {
  period: string;
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
  itemsSold: number;
}

export interface IRevenueReport {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  totalOrders: number;
  totalItemsSold: number;
  averageOrderValue: number;
  periods: IRevenuePeriod[];
}

export interface IPaymentMethodReport {
  method: string;
  count: number;
  totalAmount: number;
  percentage: number;
}

// --- Expense Report (chi phí vận hành) ---
export interface IExpensePeriod {
  period: string;
  amount: number;
}

export interface IExpenseCategoryBreakdown {
  categoryId: string;
  categoryName: string;
  amount: number;
}

export interface IExpenseReport {
  totalExpense: number;
  periods: IExpensePeriod[];
  byCategory: IExpenseCategoryBreakdown[];
}

// --- Break-even Analysis (điểm hòa vốn) ---
export interface IOperatingCostLine {
  label: string;
  amount: number;
  isEstimated: boolean;
  source: 'recorded' | 'recurring' | 'labor' | 'labor-estimated' | 'variable-estimated';
}

export interface IOperatingCostBreakdown {
  recordedExpenses: number;
  projectedRecurring: number;
  laborActual: number;
  laborEstimated: number;
  variableEstimated: number;
  total: number;
  hasEstimates: boolean;
  fixedCost: number;
  variableCost: number;
  laborCost: number;
  otherCost: number;
  lines: IOperatingCostLine[];
}

export interface IBreakEvenAnalysis {
  period: string;
  targetDate: string;
  fixedCosts: number;
  cogsRatio: number;
  breakEvenRevenue: number;
  actualRevenue: number;
  gap: number;
  operatingCost: IOperatingCostBreakdown;
}

// --- Cleaning Schedule ---
export type CleaningShiftBlock = 'Morning' | 'Afternoon' | 'Evening';
export type CleaningTaskStatus = 'Pending' | 'Done' | 'Passed' | 'Failed';

export interface ICleaningPenalty {
  id: string;
  userId: string;
  userName?: string | null;
  amount: number;
  reason?: string | null;
  createdByUserId: string;
  createdAt: string;
  voidedAt?: string | null;
}

export interface ICleaningTaskInstance {
  id: string;
  templateId: string;
  name: string;
  area?: string | null;
  date: string; // "yyyy-MM-dd"
  cleaningBlock: CleaningShiftBlock;
  status: CleaningTaskStatus;
  completedByUserId?: string | null;
  completedByUserName?: string | null;
  completedAt?: string | null;
  photoObjectKey?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  penalties: ICleaningPenalty[];
}

export interface IMyCleaningChecklist {
  shiftAssignmentId: string;
  shiftName: string;
  cleaningBlock: CleaningShiftBlock;
  tasks: ICleaningTaskInstance[];
}

export interface ICleaningWeekCell {
  date: string; // "yyyy-MM-dd"
  cleaningBlock: CleaningShiftBlock;
  staffNames: string[];
  pendingCount: number;
  doneCount: number;
  passedCount: number;
  failedCount: number;
}

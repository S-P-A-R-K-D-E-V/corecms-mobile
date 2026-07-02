import dayjs from 'dayjs';

import type { IShiftAssignment, IShiftSchedule } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Helpers cho khu "Quản lý" — suy trạng thái ca từ attendanceLog và phản chiếu
// luật BE ShiftMutationGuard lên UI (disable sớm cho UX tốt; BE vẫn là nguồn
// chặn cuối cùng). Giờ thiết bị coi như giờ VN (app nội bộ).
// ----------------------------------------------------------------------

export type AssignmentStatus = 'Scheduled' | 'Present' | 'Absent' | 'Late';

/** Trạng thái hiển thị của 1 ca: từ log chấm công + mốc thời gian. */
export function deriveStatus(a: IShiftAssignment, now = dayjs()): AssignmentStatus {
  if (a.attendanceLog?.checkInTime) return a.attendanceLog.isLate ? 'Late' : 'Present';
  const end = dayjs(`${a.date} ${a.endTime}`);
  return end.isValid() && now.isAfter(end) ? 'Absent' : 'Scheduled';
}

/** Ca đã đến/qua giờ bắt đầu chưa (ShiftMutationGuard.HasShiftStarted). */
export function hasShiftStarted(a: Pick<IShiftAssignment, 'date' | 'startTime'>, now = dayjs()): boolean {
  const start = dayjs(`${a.date} ${a.startTime}`);
  return start.isValid() && !now.isBefore(start);
}

/** Ca đã có checkin chưa (ShiftMutationGuard.HasCheckin). */
export function hasCheckin(a: IShiftAssignment): boolean {
  return !!a.attendanceLog?.checkInTime;
}

/**
 * Được phép thao tác (xếp/gỡ/đổi) trên ca này không — phản chiếu ShiftMutationGuard:
 *   - Ca đã checkin: chỉ Admin.
 *   - Ca đã bắt đầu: Manager bị chặn, Admin được.
 */
export function canMutateAssignment(a: IShiftAssignment, isAdmin: boolean, now = dayjs()): boolean {
  if (isAdmin) return true;
  return !hasCheckin(a) && !hasShiftStarted(a, now);
}

/** Lý do bị khoá (hiện tooltip/caption) — null nếu thao tác được. */
export function mutationLockReason(a: IShiftAssignment, isAdmin: boolean, now = dayjs()): string | null {
  if (isAdmin) return null;
  if (hasCheckin(a)) return 'Ca đã có checkin — chỉ Admin được thao tác';
  if (hasShiftStarted(a, now)) return 'Ca đã bắt đầu — chỉ Admin được thao tác';
  return null;
}

// WeekDays bitmask của BE, index theo JS getDay(): 0=CN → 64, T2 → 1, ...
const DAY_BITMASK = [64, 1, 2, 4, 8, 16, 32];

/** Định nghĩa ca có áp dụng cho 1 ngày không (đồng bộ RegisterShiftScreen). */
export function isScheduleOnDate(s: IShiftSchedule, date: dayjs.Dayjs): boolean {
  const d = date.format('YYYY-MM-DD');
  const from = s.fromDate.split('T')[0];
  const to = s.toDate ? s.toDate.split('T')[0] : '9999-12-31';
  if (d < from || d > to) return false;
  return (s.repeatDays & DAY_BITMASK[date.day()]) !== 0;
}

import dayjs from 'dayjs';
import type { IMyScheduleItem } from 'src/types/corecms-api';

export type Coords = { latitude: number; longitude: number; accuracy?: number };
export type GpsStatus = 'idle' | 'loading' | 'ready' | 'error';

export type CheckInWindowStatus = 'too-early' | 'allowed' | 'too-late' | 'checked-in';

export interface WindowInfo {
  status: CheckInWindowStatus;
  allowedFrom: dayjs.Dayjs;
  shiftEnd: dayjs.Dayjs;
  minutesUntil: number; // positive = time until allowed, negative = already past
}

export function getCheckInWindow(shift: IMyScheduleItem, now: dayjs.Dayjs): WindowInfo {
  const allowedFrom = dayjs(`${shift.date} ${shift.startTime}`).subtract(
    shift.checkInAllowedMinutesBefore,
    'minute'
  );
  const shiftEnd = dayjs(`${shift.date} ${shift.endTime}`);
  const minutesUntil = allowedFrom.diff(now, 'minute');

  if (shift.hasCheckedIn) return { status: 'checked-in', allowedFrom, shiftEnd, minutesUntil };
  if (now.isBefore(allowedFrom)) return { status: 'too-early', allowedFrom, shiftEnd, minutesUntil };
  if (now.isAfter(shiftEnd)) return { status: 'too-late', allowedFrom, shiftEnd, minutesUntil };
  return { status: 'allowed', allowedFrom, shiftEnd, minutesUntil };
}

/** First shift the user can smart-check-in to right now (mirrors server logic). */
export function getActiveCheckinShift(shifts: IMyScheduleItem[], now: dayjs.Dayjs): IMyScheduleItem | null {
  const sorted = [...shifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const shift of sorted) {
    if (getCheckInWindow(shift, now).status === 'allowed') return shift;
  }
  return null;
}

/** Next upcoming shift (too-early), for countdown display. */
export function getNextUpcomingShift(shifts: IMyScheduleItem[], now: dayjs.Dayjs): IMyScheduleItem | null {
  const sorted = [...shifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const shift of sorted) {
    if (getCheckInWindow(shift, now).status === 'too-early') return shift;
  }
  return null;
}

export function formatTime(iso?: string | null): string {
  if (!iso) return '--:--';
  return dayjs(iso).format('HH:mm');
}

/** Thời gian đã trôi từ mốc `fromISO` đến `now` dạng HH:mm:ss (cho đồng hồ "đã làm"). */
export function formatElapsed(fromISO?: string | null, now: Date = new Date()): string {
  if (!fromISO) return '00:00:00';
  const secs = Math.max(0, Math.floor((now.getTime() - new Date(fromISO).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

export function formatCountdown(minutes: number): string {
  if (minutes <= 0) return '';
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`;
}

// ── Khoảng cách GPS tới cửa hàng ────────────────────────────────────────────────
// Các tiện ích định vị nay đặt tại src/services/geo.ts (dùng chung với cổng GPS).
export { haversineMeters, formatDistance, nearestBranchDistance, findNearestBranch, reverseGeocode } from 'src/services/geo';

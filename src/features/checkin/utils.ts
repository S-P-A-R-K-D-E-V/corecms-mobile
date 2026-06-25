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

export function formatCountdown(minutes: number): string {
  if (minutes <= 0) return '';
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`;
}

// ── Khoảng cách GPS tới cửa hàng ────────────────────────────────────────────────

/** Khoảng cách giữa 2 toạ độ (Haversine) — đơn vị mét. */
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "x m" khi < 1km, ngược lại "x.x km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Khoảng cách (mét) tới chi nhánh gần nhất có toạ độ; null nếu không có dữ liệu. */
export function nearestBranchDistance(
  coords: { latitude: number; longitude: number },
  branches: { latitude?: number; longitude?: number }[]
): number | null {
  let min: number | null = null;
  for (const b of branches) {
    if (b.latitude == null || b.longitude == null) continue;
    const d = haversineMeters(coords, { latitude: b.latitude, longitude: b.longitude });
    if (min === null || d < min) min = d;
  }
  return min;
}

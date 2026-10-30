import dayjs, { type Dayjs } from 'dayjs';

import type { IMyScheduleItem } from 'src/types/corecms-api';
import type { ISalesTarget, ISalesTargetSlot, IStaffPerformanceScore, IViolationEntry, IViolationSummary } from 'src/types/hr';

// ----------------------------------------------------------------------
// Phần thuần của các màn Nhân sự (test được): luật báo trước 24 giờ, ca xin nghỉ được, target của một ca, tiền.
// ----------------------------------------------------------------------

/** Xếp hạng theo tổng điểm, bằng điểm cùng hạng. Chưa có ca hoặc điểm mặc định (người mới) không có hạng, đứng cuối. */
export function rankScores(scores: IStaffPerformanceScore[]): { score: IStaffPerformanceScore; rank: number | null }[] {
  const isRanked = (s: IStaffPerformanceScore) => s.shiftCount > 0 && !s.isDefaultScore;
  const ranked = scores.filter(isRanked).sort((a, b) => b.total - a.total);
  let rank = 0;
  return [
    ...ranked.map((score, i) => {
      if (i === 0 || score.total !== ranked[i - 1].total) rank = i + 1;
      return { score, rank };
    }),
    ...scores.filter((s) => !isRanked(s)).map((score) => ({ score, rank: null })),
  ];
}

/** Báo trước tối thiểu khi xin nghỉ ca (Nội quy Điều 7). */
export const LEAVE_NOTICE_HOURS = 24;

/** Số giờ còn tới giờ vào ca (giờ máy = giờ Việt Nam). */
export function hoursUntilShift(date: string, startTime: string, now: Dayjs = dayjs()): number {
  return dayjs(`${date}T${startTime.slice(0, 5)}:00`).diff(now, 'minute') / 60;
}

/** Ca sắp tới, chưa chấm công — xin nghỉ được; sắp xếp theo giờ vào. */
export function leaveCandidates(schedule: IMyScheduleItem[], now: Dayjs = dayjs()): IMyScheduleItem[] {
  return schedule
    .filter((s) => !s.hasCheckedIn && hoursUntilShift(s.date, s.startTime, now) > 0)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

/** Target khung giờ của một ca (ngày + lịch ca); khớp giờ vào nếu lịch ca đổi phiên bản. */
export function slotTargetFor(
  targets: ISalesTarget[],
  date: string,
  shiftScheduleId: string,
  startTime?: string
): ISalesTargetSlot | null {
  const slots = targets.flatMap((t) => t.slots).filter((s) => s.date === date);
  return (
    slots.find((s) => s.shiftScheduleId === shiftScheduleId) ??
    (startTime ? slots.find((s) => s.start.slice(0, 5) === startTime.slice(0, 5)) : undefined) ??
    null
  );
}

/** 1.250.000đ */
export function fVnd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value).toLocaleString('vi-VN')}đ`;
}

/** Còn trong hạn đề nghị xem xét lại kết quả tháng (3 ngày làm việc từ khi công bố). */
export function canRequestReview(reviewDeadline: string | null | undefined, requestedAt: string | null | undefined, now: Dayjs = dayjs()) {
  return !requestedAt && !!reviewDeadline && dayjs(reviewDeadline).isAfter(now);
}

/** Gọn cho ô nhỏ: 3.150.000 → "3,2tr", 850.000 → "850k". */
export function fCompactVnd(value: number): string {
  if (value >= 1_000_000) return `${(Math.round(value / 100_000) / 10).toLocaleString('vi-VN')}tr`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return `${Math.round(value)}đ`;
}

/** Số đếm nhập tay: "" → null (xoá số đếm), số ≥ 0 (dấu phẩy thập phân được) → số, còn lại → undefined (sai). */
export function parseCount(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Dòng phiếu kiểm ca có ô nhập khác số đã lưu — gửi lên khi lưu / nộp (quantity undefined = nhập sai). */
export function changedCounts(
  lines: { lineId: string; countedQuantity?: number | null }[],
  texts: Record<string, string>,
): { lineId: string; quantity: number | null | undefined }[] {
  return lines
    .filter((l) => (texts[l.lineId] ?? '') !== (l.countedQuantity == null ? '' : String(l.countedQuantity)))
    .map((l) => ({ lineId: l.lineId, quantity: parseCount(texts[l.lineId] ?? '') }));
}

// ── Vi phạm & điểm trừ ───────────────────────────────────────────────

/** Ngày đầu tháng (YYYY-MM-DD) — tham số month của /hr-violations. */
export function monthOf(date: Dayjs = dayjs()): string {
  return date.startOf('month').format('YYYY-MM-DD');
}

/** Thưởng doanh số tuần theo tổng điểm trừ; null khi cửa hàng không đặt ngưỡng. */
export function bonusText(s: Pick<IViolationSummary, 'weeklyBonusPct' | 'notComplete' | 'losesMonthlyBonus'>): string | null {
  if (s.weeklyBonusPct == null) return s.losesMonthlyBonus ? 'Mất thưởng tháng' : null;
  if (s.weeklyBonusPct >= 100) return 'Nhận đủ thưởng tuần';
  if (s.weeklyBonusPct <= 0) return s.notComplete ? 'Không nhận thưởng · Không hoàn thành' : 'Không nhận thưởng tuần';
  return `Nhận ${s.weeklyBonusPct}% thưởng tuần`;
}

/** Còn khiếu nại được: đang tính, chưa khiếu nại, chưa quá hạn (hạn trống = không giới hạn). */
export function canComplain(e: IViolationEntry, today: string = dayjs().format('YYYY-MM-DD')): boolean {
  return e.status === 'Active' && !e.complainedAt && (!e.complaintDeadline || e.complaintDeadline >= today);
}

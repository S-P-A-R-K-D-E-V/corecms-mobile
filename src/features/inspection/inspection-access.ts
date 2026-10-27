import dayjs from 'dayjs';

import type { IInspectionShift } from 'src/types/inspection';

// ----------------------------------------------------------------------
// Ai bấm được "Kiểm nhanh" (phần thuần) — khớp core-be StartInspection: phải làm trong ca đó, và là trưởng ca hoặc
// có inspection.conduct. Không làm trong ca thì chỉ kiểm đột xuất (inspection.spot).
// ----------------------------------------------------------------------

export function canQuickCheck(shift: IInspectionShift, canConduct: boolean): boolean {
  return shift.iAmOnShift && (shift.iAmShiftLead || canConduct);
}

/** Phút trước giờ vào ca đã cho hiện thẻ "Kiểm nhanh ca này" ở trang chủ. */
export const HOME_CARD_LEAD_MINUTES = 30;

/**
 * Ca hôm nay cần mình kiểm nhanh ngay: mình là trưởng ca, ca chính (nhắc của BE cũng chỉ cho ca chính), đang trong giờ
 * ca (từ 30 phút trước giờ vào tới giờ ra) và chưa nộp. Thẻ ở trang chủ chỉ cho trưởng ca — quản lý vào màn Kiểm tra
 * cửa hàng.
 */
export function shiftNeedingMyQuickCheck(shifts: readonly IInspectionShift[], now: dayjs.Dayjs): IInspectionShift | null {
  for (const s of shifts) {
    if (s.shiftType !== 'Main' || !s.iAmShiftLead || !s.iAmOnShift || s.quickStatus === 'Submitted') continue;
    const start = dayjs(`${s.date} ${s.startTime}`);
    let end = dayjs(`${s.date} ${s.endTime}`);
    if (!end.isAfter(start)) end = end.add(1, 'day'); // ca qua đêm
    if (now.isAfter(start.subtract(HOME_CARD_LEAD_MINUTES, 'minute')) && now.isBefore(end)) return s;
  }
  return null;
}

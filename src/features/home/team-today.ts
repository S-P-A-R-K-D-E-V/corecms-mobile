import type { AuthUser } from 'src/auth/auth-context';
import { PERMISSIONS, hasAnyPermission } from 'src/auth/permissions';
import type { ITodayBoardChange, ITodayBoardItem, ITodayBoardPartialCover } from 'src/types/corecms-api';
import { t } from 'src/i18n';

// ----------------------------------------------------------------------
// "Nhân sự hôm nay": nhóm người đi làm theo ca (Sáng / Chiều / Tối… rồi ca Phụ), ghi chú ca đã đổi / nhận làm thay và
// người làm hộ một phần ca kèm khoảng giờ. Hàm thuần để test.
// ----------------------------------------------------------------------

/** Ai thấy thẻ: xem chấm công hoặc xem lịch làm của mọi người — khớp quyền của GET attendance/today-board. */
export function canSeeTeamToday(user: AuthUser | null | undefined): boolean {
  return hasAnyPermission(user, [PERMISSIONS.attendance.read, PERMISSIONS.shift.assignmentRead]);
}

export interface ShiftGroup {
  key: string;
  name: string;
  startTime: string;
  endTime: string;
  isExtra: boolean;
  items: ITodayBoardItem[];
}

/**
 * Nhóm theo mẫu ca (core-be cũ không trả mẫu ca → theo tên ca). Ca chính theo giờ vào ca, ca Phụ xếp sau; trong nhóm giữ
 * thứ tự core-be trả (cần chú ý lên trước).
 */
export function groupByShift(items: ITodayBoardItem[]): ShiftGroup[] {
  const groups = new Map<string, ShiftGroup>();
  for (const it of items) {
    const key = it.shiftTemplateId || it.shiftName || '-';
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        key,
        name: it.shiftName,
        startTime: it.startTime,
        endTime: it.endTime,
        isExtra: it.shiftType === 'Extra',
        items: [it],
      });
      continue;
    }
    g.items.push(it);
    if (it.startTime < g.startTime) g.startTime = it.startTime;
    if (it.endTime > g.endTime) g.endTime = it.endTime;
  }
  return [...groups.values()].sort(
    (a, b) => Number(a.isExtra) - Number(b.isExtra) || a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name)
  );
}

/** "Đổi ca với An" / "Làm thay An" (+ "quản lý xếp" khi quản lý chỉ định thẳng). */
export function changeText(change: ITodayBoardChange): string {
  const text = t(change.kind === 'swap' ? 'home.swappedWith' : 'home.coveringFor', { name: change.otherStaffName });
  return change.directed ? `${text} · ${t('home.byManager')}` : text;
}

/** Khoảng giờ làm hộ: "12:30–13:10", "12:30 → khi An vào", "khi An về → 22:30", "từ 13:30" (+ "dự kiến"). */
export function coverWindowText(cover: ITodayBoardPartialCover, ownerName: string): string {
  const { from, to } = cover;
  let text: string;
  if (from && to) text = `${from}–${to}`;
  else if (from) text = cover.side === 'LateArrive' ? t('home.coverUntilIn', { from, name: ownerName }) : t('home.coverSince', { time: from });
  else if (to) text = t('home.coverAfterOut', { name: ownerName, to });
  else return t('home.coverNoTime');
  return cover.isActual ? text : `${text} (${t('home.estimated')})`;
}

const SIDE_KEY: Record<ITodayBoardPartialCover['side'], string> = {
  LateArrive: 'home.coverSideLateArrive',
  EarlyLeave: 'home.coverSideEarlyLeave',
  MidShift: 'home.coverSideMidShift',
};

/** "Bình làm hộ · đi muộn · 12:30–13:10". */
export function partialCoverText(cover: ITodayBoardPartialCover, ownerName: string): string {
  return [t('home.partialCoverBy', { name: cover.staffName }), t(SIDE_KEY[cover.side] ?? SIDE_KEY.MidShift), coverWindowText(cover, ownerName)].join(' · ');
}

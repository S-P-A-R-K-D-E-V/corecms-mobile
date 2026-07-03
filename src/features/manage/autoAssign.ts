import dayjs from 'dayjs';

import type { IShiftSchedule } from 'src/types/corecms-api';
import { isScheduleOnDate } from './utils';

// ----------------------------------------------------------------------
// Thuật toán đề xuất phân công tự động — port ĐẦY ĐỦ từ core-fe
// (attendance-assignments-view-v2). Quy tắc:
//   - Mỗi ca tối đa 2 người (MAX_STAFF), mỗi NV tối đa 2 ca/ngày (cap cứng).
//   - Chỉ định (designation) THEO CA: luôn xếp trước, bỏ qua ngoại trừ & cap.
//   - Ngoại trừ (exclusion) THEO CA: không bao giờ xếp.
//   - "Khóa ca" (onlyRegistered): NV chỉ được xếp ca chính họ đã ĐĂNG KÝ.
//   - Thứ tự ưu tiên (rank): schedulingPriority CAO trước → ít ca trong tuần
//     trước (cân bằng) → điểm vi phạm THẤP trước.
//   - Tier: 0 chỉ định → 1 đã chọn & đã đăng ký ca này → 2 đã chọn còn lại
//     (loại NV "khóa ca").
// slotKey = `${scheduleId}_${date}` (per-slot, không phải per-template).
// ----------------------------------------------------------------------

export const MAX_STAFF_PER_SLOT = 2;
export const MAX_SHIFTS_PER_DAY = 2;

export function slotKeyOf(scheduleId: string, date: string): string {
  return `${scheduleId}_${date}`;
}

export type ProposalSlot = {
  scheduleId: string;
  date: string; // "yyyy-MM-dd"
  scheduleName: string;
  startTime: string;
  endTime: string;
  proposedStaffIds: string[];
  /** Trong số được đề xuất, ai đã đăng ký ca này (để hiển thị nhãn). */
  registeredStaffIds: Set<string>;
};

export type BuildProposalInput = {
  schedules: IShiftSchedule[];
  /** 7 ngày của tuần (dayjs). */
  days: dayjs.Dayjs[];
  /** NV được đưa vào phân công. */
  selectedIds: string[];
  /** NV chỉ được xếp ca họ đã đăng ký ("khóa ca"). */
  onlyRegisteredIds: Set<string>;
  /** slotKey → staffId[] chỉ định. */
  designationMap: Record<string, string[]>;
  /** slotKey → staffId[] ngoại trừ. */
  exclusionMap: Record<string, string[]>;
  /** slotKey → set staffId đã đăng ký ca đó. */
  registrationMap: Map<string, Set<string>>;
  /** Ưu tiên xếp ca (schedulingPriority) — cao hơn xếp trước. */
  priorityOf: (staffId: string) => number;
  /** Điểm vi phạm (muộn + về sớm) — thấp hơn xếp trước. */
  punctOf: (staffId: string) => number;
};

export function buildAutoAssignProposal(input: BuildProposalInput): ProposalSlot[] {
  const {
    schedules, days, selectedIds, onlyRegisteredIds,
    designationMap, exclusionMap, registrationMap, priorityOf, punctOf,
  } = input;

  const runningCount = new Map<string, number>(); // cân bằng cả tuần
  const dailyCount = new Map<string, number>();    // trần 2 ca/ngày
  const selectedSet = new Set(selectedIds);
  const result: ProposalSlot[] = [];

  // Rank: ưu tiên cao trước → ít ca tuần trước → ít vi phạm trước → ổn định.
  const rank = (a: string, b: string) => {
    const pa = priorityOf(a), pb = priorityOf(b);
    if (pa !== pb) return pb - pa;
    const ra = runningCount.get(a) ?? 0, rb = runningCount.get(b) ?? 0;
    if (ra !== rb) return ra - rb;
    const sa = punctOf(a), sb = punctOf(b);
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  };

  for (const day of days) {
    const dateIso = day.format('YYYY-MM-DD');
    const daySchedules = schedules
      .filter((s) => s.isActive && isScheduleOnDate(s, day))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    for (const schedule of daySchedules) {
      const key = slotKeyOf(schedule.id, dateIso);
      const excluded = new Set(exclusionMap[key] ?? []);
      const designated = designationMap[key] ?? [];
      const registered = registrationMap.get(key) ?? new Set<string>();

      const chosen: string[] = [];
      const taken = new Set<string>();
      const atDailyCap = (id: string) => (dailyCount.get(`${id}_${dateIso}`) ?? 0) >= MAX_SHIFTS_PER_DAY;

      // Tier 0 — chỉ định: luôn xếp trước (bỏ qua ngoại trừ/đăng ký/tích chọn & cap).
      for (const id of designated) {
        if (chosen.length >= MAX_STAFF_PER_SLOT) break;
        if (!taken.has(id)) { chosen.push(id); taken.add(id); }
      }

      const pick = (pool: string[]) => {
        for (const id of pool) {
          if (chosen.length >= MAX_STAFF_PER_SLOT) break;
          if (!taken.has(id) && !excluded.has(id) && !atDailyCap(id)) { chosen.push(id); taken.add(id); }
        }
      };

      // Tier 1: đã chọn & đã đăng ký ca này.
      pick(selectedIds.filter((id) => selectedSet.has(id) && registered.has(id)).sort(rank));

      // Tier 2: đã chọn còn lại — loại NV "khóa ca" (không đăng ký ca này).
      if (chosen.length < MAX_STAFF_PER_SLOT) {
        pick(selectedIds.filter((id) => !taken.has(id) && !onlyRegisteredIds.has(id)).sort(rank));
      }

      chosen.forEach((id) => {
        runningCount.set(id, (runningCount.get(id) ?? 0) + 1);
        const dk = `${id}_${dateIso}`;
        dailyCount.set(dk, (dailyCount.get(dk) ?? 0) + 1);
      });

      result.push({
        scheduleId: schedule.id,
        date: dateIso,
        scheduleName: schedule.templateName,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        proposedStaffIds: chosen,
        registeredStaffIds: new Set(chosen.filter((id) => registered.has(id))),
      });
    }
  }

  return result;
}

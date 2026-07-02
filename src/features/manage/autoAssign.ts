import dayjs from 'dayjs';

import type { IShiftSchedule } from 'src/types/corecms-api';
import { isScheduleOnDate } from './utils';

// ----------------------------------------------------------------------
// Thuật toán đề xuất phân công tự động (port rút gọn từ core-fe
// attendance-assignments-view-v2). Quy tắc giữ nguyên tinh thần:
//   - Mỗi ca tối đa 2 người (MAX_STAFF).
//   - Mỗi nhân viên tối đa 2 ca/ngày (MAX_SHIFTS_PER_DAY).
//   - Chỉ định (designation) theo ca: luôn xếp trước, bỏ qua trần ngày.
//   - Ngoại trừ (exclusion) theo ca: không bao giờ xếp.
//   - Xếp phần còn lại từ NV đã chọn, ưu tiên: ít ca trong tuần trước → điểm
//     vi phạm (muộn + về sớm) thấp trước (điểm càng thấp càng ưu tiên).
// Chỉ định / ngoại trừ áp theo TEMPLATE (áp cho mọi ngày ca đó chạy) — phù
// hợp thao tác trên mobile.
// ----------------------------------------------------------------------

export const MAX_STAFF_PER_SLOT = 2;
export const MAX_SHIFTS_PER_DAY = 2;

export type ProposalSlot = {
  scheduleId: string;
  date: string; // "yyyy-MM-dd"
  scheduleName: string;
  startTime: string;
  endTime: string;
  proposedStaffIds: string[];
};

export type BuildProposalInput = {
  schedules: IShiftSchedule[];
  /** 7 ngày của tuần (dayjs). */
  days: dayjs.Dayjs[];
  /** NV được đưa vào phân công. */
  selectedIds: string[];
  /** templateId → set staffId được chỉ định. */
  designationByTemplate: Record<string, Set<string>>;
  /** templateId → set staffId bị ngoại trừ. */
  exclusionByTemplate: Record<string, Set<string>>;
  /** Điểm vi phạm mỗi NV (muộn + về sớm); càng thấp càng ưu tiên. */
  scoreOf: (staffId: string) => number;
};

export function buildAutoAssignProposal(input: BuildProposalInput): ProposalSlot[] {
  const { schedules, days, selectedIds, designationByTemplate, exclusionByTemplate, scoreOf } = input;

  const runningCount = new Map<string, number>(); // cân bằng cả tuần
  const dailyCount = new Map<string, number>();    // trần 2 ca/ngày
  const selectedSet = new Set(selectedIds);

  const result: ProposalSlot[] = [];

  // Duyệt theo ngày rồi theo ca (giờ bắt đầu) để phân bổ ổn định.
  for (const day of days) {
    const dateIso = day.format('YYYY-MM-DD');
    const daySchedules = schedules
      .filter((s) => s.isActive && isScheduleOnDate(s, day))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    for (const schedule of daySchedules) {
      const templateId = schedule.shiftTemplateId;
      const excluded = exclusionByTemplate[templateId] ?? new Set<string>();
      const designated = [...(designationByTemplate[templateId] ?? new Set<string>())];

      const chosen: string[] = [];
      const taken = new Set<string>();
      const atDailyCap = (id: string) => (dailyCount.get(`${id}_${dateIso}`) ?? 0) >= MAX_SHIFTS_PER_DAY;

      // Ưu tiên 0 — chỉ định: luôn xếp trước (bỏ qua trần ngày & ngoại trừ).
      for (const id of designated) {
        if (chosen.length >= MAX_STAFF_PER_SLOT) break;
        if (!taken.has(id)) { chosen.push(id); taken.add(id); }
      }

      // Phần còn lại từ NV đã chọn: loại ngoại trừ / đã lấy / quá trần ngày.
      const pool = selectedIds
        .filter((id) => selectedSet.has(id) && !taken.has(id) && !excluded.has(id) && !atDailyCap(id))
        .sort((a, b) => {
          const ra = runningCount.get(a) ?? 0;
          const rb = runningCount.get(b) ?? 0;
          if (ra !== rb) return ra - rb;           // ít ca trước
          const sa = scoreOf(a);
          const sb = scoreOf(b);
          if (sa !== sb) return sa - sb;            // ít vi phạm trước
          return a.localeCompare(b);                // ổn định
        });

      for (const id of pool) {
        if (chosen.length >= MAX_STAFF_PER_SLOT) break;
        chosen.push(id);
        taken.add(id);
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
      });
    }
  }

  return result;
}

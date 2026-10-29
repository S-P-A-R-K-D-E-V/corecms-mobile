import type { IShiftWorkItem, IShiftWorkShift } from 'src/types/inspection';
import type { ICleaningTaskInstance, IMyCleaningChecklist } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Việc trong ca hôm nay cho thẻ trang chủ (phần thuần, test được): hạng mục tự làm (shift-work) + việc theo lịch cũ
// (cleaning) gộp chung một danh sách với cùng bốn trạng thái.
// ----------------------------------------------------------------------

export type WorkRowStatus = 'Pending' | 'Done' | 'Passed' | 'Failed';

export type WorkRow = { id: string; name: string; area: string | null; status: WorkRowStatus };

/** Kết quả kiểm có trước; chưa kiểm thì "đã làm" khi có người gửi ảnh. Không áp dụng coi như đã xong. */
export function shiftWorkStatus(item: Pick<IShiftWorkItem, 'outcome' | 'completion'>): WorkRowStatus {
  if (item.outcome === 'Pass') return 'Passed';
  if (item.outcome === 'Fail') return 'Failed';
  if (item.outcome === 'NotApplicable' || item.completion) return 'Done';
  return 'Pending';
}

export function todayWorkRows(
  shiftWork: readonly IShiftWorkShift[] | undefined,
  legacy: readonly IMyCleaningChecklist[] | undefined
): WorkRow[] {
  const work: WorkRow[] = (shiftWork ?? []).flatMap((s) =>
    s.items.map((i) => ({
      id: `${s.shiftScheduleId}:${i.itemId}`,
      name: i.title,
      area: i.zones.length > 0 ? `Khu ${i.zones.join(', ')}` : null,
      status: shiftWorkStatus(i),
    }))
  );
  const old: WorkRow[] = (legacy ?? []).flatMap((s) =>
    s.tasks.map((t: ICleaningTaskInstance) => ({ id: t.id, name: t.name, area: t.area ?? null, status: t.status }))
  );
  return [...work, ...old];
}

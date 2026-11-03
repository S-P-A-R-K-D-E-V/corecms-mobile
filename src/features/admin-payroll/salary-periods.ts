import type { ISalaryConfiguration } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Mức lương theo từng khoảng của kỳ — giống bộ tính lương ở backend: mỗi ngày dùng cấu hình có effectiveFrom
// mới nhất ≤ ngày đó; một cấu hình hết hiệu lực ở effectiveTo hoặc khi cấu hình sau bắt đầu. Kỳ cũ thấy mức cũ,
// kỳ có đổi lương thấy cả mức cũ và mức mới.
// ----------------------------------------------------------------------

export type SalaryPeriod = { config: ISalaryConfiguration; from: string; to: string };

const day = (d: string) => d.slice(0, 10);

function prevDay(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

/** Các cấu hình áp trong khoảng [from, to] (yyyy-MM-dd), theo thứ tự ngày, kèm khoảng ngày áp. */
export function salaryPeriods(list: ISalaryConfiguration[] | undefined, from: string, to: string): SalaryPeriod[] {
  if (!list?.length) return [];
  const ordered = [...list].sort(
    (a, b) => day(a.effectiveFrom).localeCompare(day(b.effectiveFrom)) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
  );
  const result: SalaryPeriod[] = [];
  ordered.forEach((config, i) => {
    let end = config.effectiveTo ? day(config.effectiveTo) : '9999-12-31';
    const next = ordered[i + 1];
    if (next && prevDay(day(next.effectiveFrom)) < end) end = prevDay(day(next.effectiveFrom));
    const start = day(config.effectiveFrom) > from ? day(config.effectiveFrom) : from;
    if (end > to) end = to;
    if (start <= end) result.push({ config, from: start, to: end });
  });
  return result;
}

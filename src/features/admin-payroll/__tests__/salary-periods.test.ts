import type { ISalaryConfiguration } from 'src/types/corecms-api';

import { salaryPeriods } from '../salary-periods';

const cfg = (id: string, amount: number, effectiveFrom: string, effectiveTo?: string) =>
  ({
    id,
    userId: 'u1',
    userName: 'Lan',
    salaryType: 'Hourly',
    amount,
    effectiveFrom,
    effectiveTo,
    createdAt: '2026-01-01T00:00:00Z',
  }) as ISalaryConfiguration;

const old = cfg('old', 22000, '2026-06-01');
const raised = cfg('new', 25500, '2026-11-01');

describe('salaryPeriods', () => {
  it('kỳ cũ chỉ thấy mức cũ dù đã có mức mới', () => {
    expect(salaryPeriods([raised, old], '2026-10-01', '2026-10-31')).toEqual([{ config: old, from: '2026-10-01', to: '2026-10-31' }]);
  });

  it('kỳ mới thấy mức mới', () => {
    expect(salaryPeriods([old, raised], '2026-11-01', '2026-11-15').map((p) => p.config.id)).toEqual(['new']);
  });

  it('đổi lương giữa kỳ thì hiện cả hai mức với khoảng ngày của từng mức', () => {
    const mid = cfg('mid', 25500, '2026-10-16T00:00:00');
    expect(salaryPeriods([old, mid], '2026-10-01', '2026-10-31').map((p) => [p.config.id, p.from, p.to])).toEqual([
      ['old', '2026-10-01', '2026-10-15'],
      ['mid', '2026-10-16', '2026-10-31'],
    ]);
  });

  it('cấu hình đã đóng trước kỳ hoặc chưa có thì không hiện', () => {
    expect(salaryPeriods([cfg('x', 20000, '2026-01-01', '2026-09-30')], '2026-10-01', '2026-10-31')).toEqual([]);
    expect(salaryPeriods(undefined, '2026-10-01', '2026-10-31')).toEqual([]);
  });
});

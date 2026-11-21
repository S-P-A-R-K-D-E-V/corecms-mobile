import dayjs from 'dayjs';

import type { ICleaningSeries } from 'src/types/corecms-api';
import type { IWorkTask } from 'src/types/hr';

import {
  buildCreateSeriesBody,
  buildDaySchedule,
  buildPersonAssignBody,
  buildShiftAssignBody,
  buildUpdateSeriesBody,
  canReassign,
  cellKey,
  cellsSummary,
  countByDay,
  emptySeriesForm,
  isRecurringTask,
  openAssignedTasks,
  rangeLabel,
  seriesToForm,
  setAssignee,
  stopDateError,
  toggleBlockAllDays,
  toggleCell,
} from '../schedule';

// Lịch tuần + Giao việc của màn Công việc (docs/cici/plans/cong-viec-mot-cho-api-contract.md mục 3).

const TODAY = '2026-11-24'; // thứ Ba

const series = (over: Partial<ICleaningSeries>): ICleaningSeries => ({
  seriesId: 's',
  name: 'Việc',
  area: null,
  group: 'Vệ sinh',
  requiresPhoto: true,
  autoViolation: false,
  assigneeUserId: null,
  assigneeName: null,
  fromDate: '2026-07-20',
  toDate: null,
  cells: [],
  ...over,
});

const everyDay = (block: 'Morning' | 'Afternoon' | 'Evening') =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, block, templateId: `${d}${block}` }));

describe('dựng lịch tuần từ chuỗi', () => {
  const sweep = series({ seriesId: 'sweep', name: 'Quét và lau sàn', cells: [...everyDay('Morning'), ...everyDay('Evening')] });
  const open = series({ seriesId: 'open', name: 'Mở cửa', group: 'Mở – đóng cửa', requiresPhoto: false, autoViolation: true, cells: everyDay('Morning') });
  const photo = series({
    seriesId: 'photo',
    name: 'Chụp ảnh 7 món',
    group: 'Marketing',
    assigneeUserId: 'u-an',
    assigneeName: 'An Xing',
    cells: [{ dayOfWeek: 1, block: 'Morning', templateId: 't' }],
  });
  const glass = series({ seriesId: 'glass', name: 'Lau kính', cells: [{ dayOfWeek: 1, block: 'Afternoon', templateId: 'g' }, { dayOfWeek: 4, block: 'Afternoon', templateId: 'g2' }] });

  it('chia theo ca, người cố định để riêng, xếp nhóm rồi tên', () => {
    const mon = buildDaySchedule([sweep, open, photo, glass], 1);
    expect(mon.Morning.map((s) => s.seriesId)).toEqual(['open', 'sweep']);
    expect(mon.Afternoon.map((s) => s.seriesId)).toEqual(['glass']);
    expect(mon.Evening.map((s) => s.seriesId)).toEqual(['sweep']);
    expect(mon.fixed.map((s) => s.seriesId)).toEqual(['photo']);

    const tue = buildDaySchedule([sweep, open, photo, glass], 2);
    expect(tue.fixed).toEqual([]);
    expect(tue.Afternoon).toEqual([]);
  });

  it('đếm việc mỗi thứ (một việc nhiều ca trong ngày tính một)', () => {
    const c = countByDay([sweep, open, photo, glass]);
    expect(c[1]).toBe(4);
    expect(c[2]).toBe(2);
    expect(c[4]).toBe(3);
  });

  it('tóm tắt ô thứ × ca', () => {
    expect(cellsSummary(sweep)).toBe('Mọi ngày · Sáng, Tối');
    expect(cellsSummary(glass)).toBe('T2: Chiều · T5: Chiều');
    expect(cellsSummary(photo)).toBe('T2');
    expect(cellsSummary({ cells: [], assigneeUserId: null })).toBe('Chưa chọn thứ');
  });

  it('nhãn hiệu lực: chỉ hiện khi chưa bắt đầu / có ngày kết thúc', () => {
    expect(rangeLabel(sweep, TODAY)).toBe('');
    expect(rangeLabel({ fromDate: '2026-12-01', toDate: null }, TODAY)).toBe('Từ 01/12');
    expect(rangeLabel({ fromDate: '2026-11-01', toDate: '2026-11-30' }, TODAY)).toBe('Đến 30/11');
    expect(rangeLabel({ fromDate: '2026-11-26', toDate: '2026-11-26' }, TODAY)).toBe('Chỉ 26/11');
    expect(rangeLabel({ fromDate: '2026-11-26', toDate: '2026-11-28' }, TODAY)).toBe('26/11 – 28/11');
  });
});

describe('biểu mẫu việc định kỳ', () => {
  it('thêm mới: body đúng hợp đồng, ô xếp T2 → CN, khu trống = null', () => {
    const form = {
      ...emptySeriesForm(TODAY),
      name: '  Lau kính  ',
      group: 'Trưng bày',
      cells: [cellKey(0, 'Evening'), cellKey(1, 'Afternoon'), cellKey(1, 'Morning')],
    };
    const r = buildCreateSeriesBody(form, TODAY);
    expect(r).toEqual({
      ok: true,
      body: {
        name: 'Lau kính',
        area: null,
        group: 'Trưng bày',
        requiresPhoto: true,
        autoViolation: false,
        assigneeUserId: null,
        fromDate: TODAY,
        toDate: null,
        cells: [
          { dayOfWeek: 1, block: 'Morning' },
          { dayOfWeek: 1, block: 'Afternoon' },
          { dayOfWeek: 0, block: 'Evening' },
        ],
      },
    });
  });

  it('kiểm lỗi: tên, ô, ngày quá khứ, ngày kết thúc trước ngày bắt đầu', () => {
    const base = { ...emptySeriesForm(TODAY), name: 'X', cells: [cellKey(1, 'Morning')] };
    expect(buildCreateSeriesBody({ ...base, name: ' ' }, TODAY)).toEqual({ ok: false, error: 'Nhập tên việc.' });
    expect(buildCreateSeriesBody({ ...base, cells: [] }, TODAY)).toEqual({ ok: false, error: 'Chọn ít nhất một ô thứ × ca.' });
    expect(buildCreateSeriesBody({ ...base, fromDate: '2026-11-23' }, TODAY).ok).toBe(false);
    expect(buildCreateSeriesBody({ ...base, toDate: '2026-11-23' }, TODAY).ok).toBe(false);
  });

  it('người làm cố định: ô chỉ thứ (block null), tắt tự ghi vi phạm; bỏ người cố định thì về ca sáng', () => {
    let form = { ...emptySeriesForm(TODAY), name: 'Chụp ảnh', autoViolation: true, cells: [cellKey(1, 'Morning'), cellKey(1, 'Evening'), cellKey(4, 'Afternoon')] };
    form = setAssignee(form, 'u-an');
    expect(form.cells.sort()).toEqual(['1|*', '4|*']);
    expect(form.autoViolation).toBe(false);
    const r = buildCreateSeriesBody({ ...form, autoViolation: true }, TODAY);
    expect(r.ok && r.body.cells).toEqual([
      { dayOfWeek: 1, block: null },
      { dayOfWeek: 4, block: null },
    ]);
    expect(r.ok && r.body.autoViolation).toBe(false);
    expect(r.ok && r.body.assigneeUserId).toBe('u-an');
    expect(setAssignee(form, null).cells.sort()).toEqual(['1|Morning', '4|Morning']);
  });

  it('bật / tắt ô, bật cả tuần một ca', () => {
    expect(toggleCell(['1|Morning'], '1|Morning')).toEqual([]);
    expect(toggleCell([], '1|Morning')).toEqual(['1|Morning']);
    const all = toggleBlockAllDays(['1|Morning'], 'Morning');
    expect(all).toHaveLength(7);
    expect(toggleBlockAllDays(all, 'Morning')).toEqual([]);
  });

  it('sửa: áp dụng từ hôm nay (hoặc ngày bắt đầu nếu chưa chạy), body có effectiveFrom', () => {
    const s = series({ seriesId: 'x', name: 'Mở cửa', requiresPhoto: false, autoViolation: true, cells: everyDay('Morning') });
    const form = seriesToForm(s, TODAY);
    expect(form.fromDate).toBe(TODAY);
    expect(form.cells).toHaveLength(7);
    const r = buildUpdateSeriesBody({ ...form, name: 'Mở cửa hàng' }, TODAY);
    expect(r.ok && r.body).toMatchObject({ name: 'Mở cửa hàng', effectiveFrom: TODAY, requiresPhoto: false, autoViolation: true });
    expect(r.ok && 'fromDate' in r.body).toBe(false);
    expect(seriesToForm(series({ fromDate: '2026-12-01', cells: [] }), TODAY).fromDate).toBe('2026-12-01');
  });

  it('dừng chỉ từ hôm nay trở đi', () => {
    expect(stopDateError(TODAY, TODAY)).toBeNull();
    expect(stopDateError('2026-11-23', TODAY)).not.toBeNull();
  });
});

describe('giao việc', () => {
  it('cả ca một ngày = chuỗi fromDate = toDate, một ô đúng thứ của ngày', () => {
    const r = buildShiftAssignBody(
      { date: '2026-11-27', block: 'Afternoon', name: 'Lau kính tủ', area: '', group: 'Trưng bày', requiresPhoto: false },
      TODAY
    );
    expect(r).toEqual({
      ok: true,
      body: {
        name: 'Lau kính tủ',
        area: null,
        group: 'Trưng bày',
        requiresPhoto: false,
        autoViolation: false,
        assigneeUserId: null,
        fromDate: '2026-11-27',
        toDate: '2026-11-27',
        cells: [{ dayOfWeek: 5, block: 'Afternoon' }],
      },
    });
    expect(buildShiftAssignBody({ date: '2026-11-20', block: 'Morning', name: 'x', area: '', group: '', requiresPhoto: true }, TODAY).ok).toBe(false);
  });

  it('một người: hạn ngày + giờ (trống = 23:59), không hạn được, kiểm người / tên / giờ', () => {
    const now = dayjs('2026-11-24T10:00:00').valueOf();
    const base = { assigneeId: 'u1', title: 'Chụp ảnh', description: '', dueDate: TODAY, dueTime: '' };
    const r = buildPersonAssignBody(base, now);
    expect(r.ok && r.body).toEqual({
      title: 'Chụp ảnh',
      description: null,
      assigneeId: 'u1',
      dueAt: dayjs('2026-11-24T23:59:00').toISOString(),
    });
    expect(buildPersonAssignBody({ ...base, dueTime: '17:30' }, now)).toMatchObject({ ok: true, body: { dueAt: dayjs('2026-11-24T17:30:00').toISOString() } });
    expect(buildPersonAssignBody({ ...base, dueDate: null }, now)).toMatchObject({ ok: true, body: { dueAt: null } });
    expect(buildPersonAssignBody({ ...base, assigneeId: null }, now)).toEqual({ ok: false, error: 'Chọn người làm.' });
    expect(buildPersonAssignBody({ ...base, dueTime: '25:00' }, now).ok).toBe(false);
    expect(buildPersonAssignBody({ ...base, dueTime: '09:00' }, now)).toEqual({ ok: false, error: 'Hạn phải sau lúc này.' });
  });

  const task = (over: Partial<IWorkTask>): IWorkTask =>
    ({ id: 't', group: 'Other', title: 'Việc', status: 'Assigned', implemented: false, createdAt: '2026-11-20T00:00:00Z', photos: [], ...over }) as IWorkTask;

  it('đổi người chỉ việc Đã giao / Trả lại; nhãn Lặp theo sourceTemplateId', () => {
    expect(canReassign(task({ status: 'Assigned' }))).toBe(true);
    expect(canReassign(task({ status: 'Rejected' }))).toBe(true);
    expect(canReassign(task({ status: 'Submitted' }))).toBe(false);
    expect(canReassign(task({ status: 'Approved' }))).toBe(false);
    expect(isRecurringTask(task({ sourceTemplateId: 'tpl', sourceDate: TODAY }))).toBe(true);
    expect(isRecurringTask(task({}))).toBe(false);
  });

  it('danh sách việc mở: chờ chấm → trả lại → đã giao (hạn gần trước), bỏ trùng + phiếu sáng kiến', () => {
    const list = openAssignedTasks([
      task({ id: 'a2', status: 'Assigned', dueAt: '2026-11-26T10:00:00Z' }),
      task({ id: 'a1', status: 'Assigned', dueAt: '2026-11-25T10:00:00Z' }),
      task({ id: 'r', status: 'Rejected' }),
      task({ id: 's', status: 'Submitted' }),
      task({ id: 's', status: 'Submitted' }),
      task({ id: 'i', status: 'Assigned', group: 'Initiative' }),
      task({ id: 'ok', status: 'Approved' }),
    ]);
    expect(list.map((t) => t.id)).toEqual(['s', 'r', 'a1', 'a2']);
  });
});

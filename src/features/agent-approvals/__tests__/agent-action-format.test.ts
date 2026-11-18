import {
  MAX_PARAMS,
  actionParams,
  agentActionRoute,
  isActionable,
  isExpiringSoon,
  isResultSuccess,
  methodLabel,
  resultMessage,
  statusInfo,
  timeLeftText,
} from '../agent-action-format';

// Màn Duyệt việc agent: tham số đọc được từ bodyJson, thời gian còn lại, kết quả chạy sau khi duyệt.

const NOW = Date.parse('2026-11-18T03:00:00Z');
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

describe('actionParams', () => {
  it('không có body → []', () => {
    expect(actionParams(null)).toEqual([]);
    expect(actionParams('  ')).toEqual([]);
  });

  it('không phải JSON → null (màn hiện nguyên văn)', () => {
    expect(actionParams('abc')).toBeNull();
  });

  it('đối tượng lồng nhau, danh sách, giá trị đặc biệt', () => {
    const body = JSON.stringify({
      name: 'Áo thun',
      price: 150000,
      active: true,
      note: null,
      tags: ['hè', 'sale'],
      lines: [{ productId: 'p1', qty: 2 }],
      meta: { source: 'agent' },
      empty: '',
    });
    expect(actionParams(body)).toEqual([
      { key: 'name', value: 'Áo thun' },
      { key: 'price', value: '150000' },
      { key: 'active', value: 'Có' },
      { key: 'note', value: '—' },
      { key: 'tags', value: 'hè, sale' },
      { key: 'lines[1].productId', value: 'p1' },
      { key: 'lines[1].qty', value: '2' },
      { key: 'meta.source', value: 'agent' },
      { key: 'empty', value: '(trống)' },
    ]);
  });

  it('giá trị đơn / danh sách rỗng ở gốc', () => {
    expect(actionParams('5')).toEqual([{ key: 'Giá trị', value: '5' }]);
    expect(actionParams('[]')).toEqual([{ key: '(danh sách)', value: '(trống)' }]);
    expect(actionParams('{}')).toEqual([{ key: '(đối tượng)', value: '(trống)' }]);
  });

  it('quá nhiều tham số → gộp phần còn lại', () => {
    const obj = Object.fromEntries(Array.from({ length: MAX_PARAMS + 10 }, (_, i) => [`k${i}`, i]));
    const params = actionParams(JSON.stringify(obj))!;
    expect(params).toHaveLength(MAX_PARAMS);
    expect(params[MAX_PARAMS - 1]).toEqual({ key: '…', value: 'và 11 tham số nữa' });
  });
});

describe('thời gian còn lại', () => {
  it('timeLeftText', () => {
    expect(timeLeftText(at(-1), NOW)).toBe('Đã hết hạn');
    expect(timeLeftText(at(0.5), NOW)).toBe('Còn dưới 1 phút');
    expect(timeLeftText(at(40), NOW)).toBe('Còn 40 phút');
    expect(timeLeftText(at(120), NOW)).toBe('Còn 2 giờ');
    expect(timeLeftText(at(125), NOW)).toBe('Còn 2 giờ 5 phút');
    expect(timeLeftText(at(60 * 24 + 60 * 3), NOW)).toBe('Còn 1 ngày 3 giờ');
    expect(timeLeftText('not-a-date', NOW)).toBe('');
  });

  it('isExpiringSoon / isActionable', () => {
    expect(isExpiringSoon(at(10), NOW)).toBe(true);
    expect(isExpiringSoon(at(30), NOW)).toBe(false);
    expect(isExpiringSoon(at(-5), NOW)).toBe(false);
    expect(isActionable({ status: 'pending', expiresAt: at(5) }, NOW)).toBe(true);
    expect(isActionable({ status: 'pending', expiresAt: at(-5) }, NOW)).toBe(false);
    expect(isActionable({ status: 'rejected', expiresAt: at(5) }, NOW)).toBe(false);
  });
});

describe('kết quả chạy', () => {
  it('isResultSuccess: đã chạy + 2xx', () => {
    expect(isResultSuccess({ status: 'executed', resultStatusCode: 200 })).toBe(true);
    expect(isResultSuccess({ status: 'executed', resultStatusCode: null })).toBe(true);
    expect(isResultSuccess({ status: 'executed', resultStatusCode: 400 })).toBe(false);
    expect(isResultSuccess({ status: 'failed', resultStatusCode: 500 })).toBe(false);
    expect(isResultSuccess({ status: 'pending', resultStatusCode: null })).toBe(false);
  });

  it('resultMessage: lấy câu lỗi của ProblemDetails / validation, không thì nguyên văn', () => {
    expect(resultMessage(JSON.stringify({ title: 'Lỗi', detail: 'Hết hàng' }))).toBe('Hết hàng');
    expect(resultMessage(JSON.stringify({ errors: { Price: ['Giá phải > 0'] } }))).toBe('Giá phải > 0');
    expect(resultMessage('Internal error')).toBe('Internal error');
    expect(resultMessage(null)).toBe('');
    expect(resultMessage('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('nhãn', () => {
  it('trạng thái lạ giữ nguyên chữ', () => {
    expect(statusInfo('pending')).toEqual({ label: 'Chờ duyệt', tone: 'warning' });
    expect(statusInfo('weird').label).toBe('weird');
  });

  it('methodLabel + route', () => {
    expect(methodLabel('post')).toBe('Tạo / gửi');
    expect(methodLabel('PATCH')).toBe('Sửa');
    expect(methodLabel('DELETE')).toBe('Xoá');
    expect(agentActionRoute('abc')).toBe('/agent/approvals/abc');
  });
});

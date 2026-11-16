import type { IViolationRule, IViolationStaff } from 'src/types/hr';
import {
  blockReason,
  exactRule,
  foldVi,
  groupRules,
  matches,
  newRuleValid,
  searchStaff,
  shortName,
  toggleNotePreset,
  topRules,
} from '../violation-record';

const rule = (name: string, extra: Partial<IViolationRule> = {}): IViolationRule => ({
  id: name,
  groupName: 'Nội quy',
  name,
  points: 2,
  autoSource: 'None',
  isActive: true,
  ...extra,
});

const staff = (fullName: string): IViolationStaff => ({
  userId: fullName,
  fullName,
  onShiftNow: false,
  shifts: [],
  monthPoints: 0,
});

describe('tìm không dấu', () => {
  it('bỏ dấu, chữ đ, khoảng trắng', () => {
    expect(foldVi('  Trần  Thị Ngọc Đào ')).toBe('tran thi ngoc dao');
    expect(matches('Trần Thị Ngọc', 'ngoc tran')).toBe(true);
    expect(matches('Trần Thị Ngọc', 'lan')).toBe(false);
    expect(matches('bất kỳ', '')).toBe(true);
  });

  it('lọc nhân viên + tên ngắn', () => {
    expect(searchStaff([staff('Lê Mai'), staff('Trần Ngọc')], 'ngọc').map((s) => s.fullName)).toEqual(['Trần Ngọc']);
    expect(shortName('Trần Thị Ngọc')).toBe('Ngọc');
  });
});

describe('danh mục', () => {
  it('Hay dùng: nhiều lần nhất trước, bù bằng luật ghi tay, bỏ luật tắt / tự ghi', () => {
    const rules = [
      rule('Đi muộn', { autoSource: 'Late' }),
      rule('Điện thoại', { recentUseCount: 1 }),
      rule('Đồng phục', { recentUseCount: 5 }),
      rule('Tắt', { isActive: false, recentUseCount: 9 }),
      rule('Két'),
    ];
    expect(topRules(rules, 3).map((r) => r.name)).toEqual(['Đồng phục', 'Điện thoại', 'Két']);
  });

  it('nhóm theo thứ tự, lọc theo tên hoặc nhóm', () => {
    const rules = [rule('A'), rule('Cãi khách', { groupName: 'Thái độ' }), rule('B')];
    expect(groupRules(rules, '').map((g) => [g.group, g.rules.length])).toEqual([['Nội quy', 2], ['Thái độ', 1]]);
    expect(groupRules(rules, 'thai do').flatMap((g) => g.rules.map((r) => r.name))).toEqual(['Cãi khách']);
    expect(exactRule(rules, ' cãi KHÁCH ')?.name).toBe('Cãi khách');
    expect(exactRule(rules, 'cãi')).toBeUndefined();
  });

  it('loại mới hợp lệ khi có tên và điểm 1–20', () => {
    expect(newRuleValid({ name: 'Ăn trong quầy', groupName: 'Khác', points: 2, component: 'Discipline' })).toBe(true);
    expect(newRuleValid({ name: ' ', groupName: 'Khác', points: 2, component: 'Discipline' })).toBe(false);
    expect(newRuleValid({ name: 'x', groupName: 'Khác', points: 21, component: 'Discipline' })).toBe(false);
    expect(newRuleValid(null)).toBe(false);
  });
});

describe('điều kiện Ghi nhận', () => {
  const ok = { people: 1, hasRule: true, newRule: null, quantity: 1, note: 'Camera', photos: [] };

  it('đủ thì được', () => {
    expect(blockReason(ok)).toBeNull();
  });

  it('căn cứ là ảnh hoặc chữ', () => {
    expect(blockReason({ ...ok, note: '  ' })).toBe('Thêm ảnh hoặc ghi căn cứ');
    expect(blockReason({ ...ok, note: '', photos: [{ status: 'done' }] })).toBeNull();
  });

  it('chờ ảnh tải xong, ảnh lỗi phải xử lý', () => {
    expect(blockReason({ ...ok, photos: [{ status: 'uploading' }, { status: 'uploading' }] })).toBe('Đang tải 2 ảnh…');
    expect(blockReason({ ...ok, photos: [{ status: 'error' }] })).toMatch(/chưa tải được/);
  });

  it('thiếu người / lỗi / số lần', () => {
    expect(blockReason({ ...ok, people: 0 })).toBe('Chọn người vi phạm');
    expect(blockReason({ ...ok, hasRule: false })).toBe('Chọn lỗi vi phạm');
    expect(blockReason({ ...ok, hasRule: false, newRule: { name: '', groupName: 'Khác', points: 2, component: 'Discipline' } }))
      .toBe('Nhập tên và điểm của loại mới');
    expect(blockReason({ ...ok, quantity: 51 })).toBe('Số lần từ 1 tới 50');
  });
});

describe('chip căn cứ', () => {
  it('điền, nối, bỏ', () => {
    expect(toggleNotePreset('', 'Camera')).toBe('Camera');
    expect(toggleNotePreset('quầy 19:10', 'Camera')).toBe('quầy 19:10; Camera');
    expect(toggleNotePreset('quầy 19:10; Camera', 'Camera')).toBe('quầy 19:10');
  });
});

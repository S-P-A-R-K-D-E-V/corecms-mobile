import { formatBadgeCount, countBadgeHeight } from '../count-badge';
import { baseTypoSize } from '../text';

describe('huy hiệu số đếm', () => {
  it('quá ngưỡng thì hiện "99+"', () => {
    expect(formatBadgeCount(7)).toBe('7');
    expect(formatBadgeCount(99)).toBe('99');
    expect(formatBadgeCount(100)).toBe('99+');
    expect(formatBadgeCount(12, 9)).toBe('9+');
  });

  it('chiều cao viên cố định theo cỡ (để chừa chỗ khi không có số)', () => {
    expect(countBadgeHeight()).toBe(16);
    expect(countBadgeHeight('md')).toBe(20);
  });
});

describe('cỡ chữ gốc khi nhân tỉ lệ cỡ chữ trong app', () => {
  it('không ghi cỡ trong className → theo variant', () => {
    expect(baseTypoSize('body')).toEqual([16, 22]);
    expect(baseTypoSize('nano', 'font-bold')).toEqual([9, 12]);
  });

  it('cỡ ghi thẳng text-[Npx] được giữ (không bị đè thành cỡ body)', () => {
    expect(baseTypoSize('body', 'text-white text-[9px] font-bold')).toEqual([9, 22]);
    expect(baseTypoSize('caption', 'text-center text-[11px] leading-[13px]')).toEqual([11, 13]);
  });
});

// Trang đăng ký ca: ≤ 4 ca → bảng tuần; ≥ 5 ca hoặc máy để chữ to → dải ngày + danh sách ca.
import { registerLayout } from '../RegisterShiftScreen';

describe('bố cục trang đăng ký ca', () => {
  it('ít ca, chữ thường → bảng tuần', () => {
    expect(registerLayout(3, 1)).toBe('grid');
    expect(registerLayout(4, 1.3)).toBe('grid');
  });

  it('từ 5 ca, hoặc chữ to theo máy → dải ngày + danh sách', () => {
    expect(registerLayout(5, 1)).toBe('days');
    expect(registerLayout(7, 1)).toBe('days');
    expect(registerLayout(3, 1.5)).toBe('days');
  });
});

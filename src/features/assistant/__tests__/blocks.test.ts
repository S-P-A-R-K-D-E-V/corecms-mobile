import type { AuthUser } from 'src/auth/auth-context';
import { normalizeBlocks } from '../blocks';
import { resolveRoute } from '../assistant-routes';

function user(roles: string[]): AuthUser {
  return {
    id: 'u1',
    email: 'a@b.co',
    displayName: 'A',
    firstName: 'A',
    lastName: 'B',
    role: roles[0] ?? '',
    roles,
    permissions: [],
    accessToken: 'x',
  };
}

const staff = user(['Staff']);
const manager = user(['Manager']);
const admin = user(['Admin']);

describe('resolveRoute', () => {
  it('route có tham số đường dẫn', () => {
    expect(resolveRoute('product-detail', { id: 'abc' }, staff)).toBe('/products/abc');
    expect(resolveRoute('payroll-detail', { id: '0b6c9e' }, staff)).toBe('/(tabs)/payroll/0b6c9e');
  });

  it('route có tham số query', () => {
    expect(resolveRoute('user-detail', { userId: 'u-42' }, admin)).toBe('/admin/user-detail?userId=u-42');
    expect(resolveRoute('payroll-cycle-detail', { cycleId: 'c1' }, admin)).toBe('/admin/payroll-detail?cycleId=c1');
  });

  it('theo vai trò: Staff không mở được báo cáo doanh thu / màn quản lý; Manager mở được màn quản lý', () => {
    expect(resolveRoute('revenue-report', undefined, staff)).toBeNull();
    expect(resolveRoute('approvals', undefined, staff)).toBeNull();
    expect(resolveRoute('approvals', undefined, manager)).toBe('/manage/approvals');
    expect(resolveRoute('revenue-report', undefined, manager)).toBeNull();
    expect(resolveRoute('revenue-report', undefined, admin)).toBe('/admin/revenue');
  });

  it('khoá lạ, thiếu / thừa tham số, giá trị lạ → null', () => {
    expect(resolveRoute('/admin/users', undefined, admin)).toBeNull();
    expect(resolveRoute('constructor', undefined, admin)).toBeNull();
    expect(resolveRoute('product-detail', undefined, staff)).toBeNull();
    expect(resolveRoute('product-detail', { id: 'abc', x: '1' }, staff)).toBeNull();
    expect(resolveRoute('product-detail', { id: '../admin' }, staff)).toBeNull();
    expect(resolveRoute('product-detail', { id: 'a?b=1' }, staff)).toBeNull();
    expect(resolveRoute('schedule', { id: 'x' }, staff)).toBeNull();
  });

  it('không có người dùng → không mở gì', () => {
    expect(resolveRoute('schedule', undefined, null)).toBeNull();
  });
});

describe('normalizeBlocks', () => {
  it('không phải mảng → rỗng; loại lạ bị bỏ', () => {
    expect(normalizeBlocks(null, admin)).toEqual([]);
    expect(normalizeBlocks({ blocks: [] }, admin)).toEqual([]);
    expect(normalizeBlocks([{ type: 'html', html: '<b>x</b>' }, 'x', 1], admin)).toEqual([]);
  });

  it('ảnh: chỉ https hoặc objectKey công khai', () => {
    const out = normalizeBlocks(
      [
        { type: 'image', url: 'http://cdn2-retail-images.kiotviet.vn/a.jpg' },
        { type: 'image', url: 'https://cdn2-retail-images.kiotviet.vn/2024/a.jpg', alt: 'Ốp lưng' },
        { type: 'image', url: 'https://user:pw@evil.com/a.jpg' },
        { type: 'image', url: 'javascript:alert(1)' },
        { type: 'image', objectKey: 'products/abc/1.jpg', alt: 'Mẫu B' },
        { type: 'image', objectKey: 'id-cards/u1/front.jpg' },
        { type: 'image', objectKey: 'assistant/u1/s1/1.jpg' },
        { type: 'image', objectKey: '../secret.jpg' },
        { type: 'image', url: 'https://a.vn/x.jpg', objectKey: 'products/x.jpg' },
      ],
      admin
    );
    expect(out).toEqual([
      { type: 'image', url: 'https://cdn2-retail-images.kiotviet.vn/2024/a.jpg', alt: 'Ốp lưng' },
      { type: 'image', objectKey: 'products/abc/1.jpg', alt: 'Mẫu B' },
    ]);
  });

  it('link: chỉ http(s); tiêu đề mặc định là tên miền', () => {
    const out = normalizeBlocks(
      [
        { type: 'link', url: 'javascript:alert(1)', title: 'x' },
        { type: 'link', url: 'tel:0900000000' },
        { type: 'link', url: 'https://cici21chualang.vn/chinh-sach' },
        // trùng url → bỏ (một thẻ, key không đụng nhau)
        { type: 'link', url: 'https://cici21chualang.vn/chinh-sach', title: 'Lặp' },
      ],
      admin
    );
    expect(out).toEqual([{ type: 'link', url: 'https://cici21chualang.vn/chinh-sach', host: 'cici21chualang.vn', title: 'cici21chualang.vn' }]);
  });

  it('nút mở màn: chỉ route người dùng mở được', () => {
    const raw = [
      { type: 'action', kind: 'navigate', label: 'Xem doanh thu', route: 'revenue-report' },
      { type: 'action', kind: 'navigate', label: 'Mở sản phẩm', route: 'product-detail', params: { id: 'abc' } },
    ];
    expect(normalizeBlocks(raw, staff)).toEqual([
      { type: 'action', kind: 'navigate', id: 'a1', label: 'Mở sản phẩm', href: '/products/abc' },
    ]);
    expect(normalizeBlocks(raw, admin)).toHaveLength(2);
  });

  it('nút thao tác: thiếu prompt hoặc confirm → bỏ; confirm thiếu chữ thì lấy nhãn / prompt', () => {
    const out = normalizeBlocks(
      [
        { type: 'action', kind: 'tool', label: 'Đăng ký ca', confirm: { title: 'x' } },
        { type: 'action', kind: 'tool', label: 'Đăng ký ca', prompt: 'Đăng ký ca sáng 05/10' },
        { type: 'action', kind: 'tool', id: 'm9', label: 'Đăng ký ca', prompt: 'Đăng ký ca sáng 05/10', confirm: {} },
      ],
      staff
    );
    expect(out).toEqual([
      {
        type: 'action',
        kind: 'tool',
        id: 'm9',
        label: 'Đăng ký ca',
        prompt: 'Đăng ký ca sáng 05/10',
        confirm: { title: 'Đăng ký ca', message: 'Đăng ký ca sáng 05/10' },
      },
    ]);
  });

  it('giới hạn số lượng: 6 ảnh, 3 nút, 1 khối gợi ý tối đa 4 câu (bỏ trùng)', () => {
    const images = Array.from({ length: 8 }, (_, i) => ({ type: 'image', objectKey: `products/${i}.jpg` }));
    const actions = Array.from({ length: 5 }, () => ({ type: 'action', kind: 'navigate', label: 'Lịch', route: 'schedule' }));
    const suggestions = [
      { type: 'suggestions', items: [{ label: 'A' }, { label: 'a' }, { label: 'B', prompt: 'Câu B' }, { label: 'C' }, { label: 'D' }, { label: 'E' }] },
      { type: 'suggestions', items: [{ label: 'X' }] },
    ];
    const out = normalizeBlocks([...images, ...actions, ...suggestions], staff);
    expect(out.filter((b) => b.type === 'image')).toHaveLength(6);
    expect(out.filter((b) => b.type === 'action')).toHaveLength(3);
    const sugg = out.filter((b) => b.type === 'suggestions');
    expect(sugg).toEqual([
      {
        type: 'suggestions',
        items: [
          { label: 'A', prompt: 'A' },
          { label: 'B', prompt: 'Câu B' },
          { label: 'C', prompt: 'C' },
          { label: 'D', prompt: 'D' },
        ],
      },
    ]);
    expect(out.length).toBeLessThanOrEqual(12);
  });
});

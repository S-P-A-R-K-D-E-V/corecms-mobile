import { existsSync } from 'fs';
import { join } from 'path';

import { NOTIFICATION_APP_ROUTES, notificationAppRoute, notificationWebUrl } from '../notification-links';

// Chạm thông báo: mở màn tương ứng trên app; không có màn thì trang chi tiết với nút mở trên web; không nhận link ra ngoài.

describe('notificationAppRoute', () => {
  it('đường dẫn web có màn tương ứng → màn app, bỏ query và dấu / cuối', () => {
    expect(notificationAppRoute('/dashboard/hr/leave')).toBe('/hr/leave');
    expect(notificationAppRoute('/dashboard/hr/performance?tab=mine')).toBe('/hr/performance');
    expect(notificationAppRoute('/dashboard/shift-pool/my-posts/')).toBe('/shift-pool');
    expect(notificationAppRoute('/dashboard/payroll/complaints')).toBe('/(tabs)/admin/payroll-complaints');
  });

  it('không có màn tương ứng hoặc đường dẫn lạ → null', () => {
    expect(notificationAppRoute('/dashboard/fnb/stock')).toBeNull();
    expect(notificationAppRoute('/dashboard')).toBeNull();
    expect(notificationAppRoute(undefined)).toBeNull();
    expect(notificationAppRoute(123)).toBeNull();
    expect(notificationAppRoute('https://evil.example/dashboard/hr/leave')).toBeNull();
    expect(notificationAppRoute('//evil.example/dashboard/hr/leave')).toBeNull();
  });

  it('mọi màn được nhắm tới đều có thật trong src/app', () => {
    const appDir = join(__dirname, '..', '..', 'app');
    const missing = NOTIFICATION_APP_ROUTES.filter((route) => {
      const file = join(appDir, route);
      return !existsSync(`${file}.tsx`) && !existsSync(join(file, 'index.tsx'));
    });
    expect(missing).toEqual([]);
  });
});

describe('notificationWebUrl', () => {
  it('ghép với gốc web của cửa hàng, giữ query', () => {
    expect(notificationWebUrl('/dashboard/fnb/stock?x=1', 'https://shop.vn/')).toBe('https://shop.vn/dashboard/fnb/stock?x=1');
  });

  it('link ra ngoài, đường dẫn thoát thư mục, hoặc không có gốc web → null', () => {
    expect(notificationWebUrl('https://evil.example', 'https://shop.vn')).toBeNull();
    expect(notificationWebUrl('/dashboard/../../evil', 'https://shop.vn')).toBeNull();
    expect(notificationWebUrl('/login', 'https://shop.vn')).toBeNull();
    expect(notificationWebUrl('/dashboard/fnb/stock', null)).toBeNull();
    expect(notificationWebUrl('/dashboard/fnb/stock', 'javascript:alert(1)')).toBeNull();
  });
});

import {
  DEFAULT_PINS,
  FEATURE_REGISTRY,
  FNB_POS_FEATURE,
  MAX_PINS,
  availableFeatures,
  featureContext,
  fnbVisible,
  hasStoreFeature,
  isFeatureVisible,
  visiblePins,
  type FeatureItem,
} from '../registry';

const staff = { role: 'Staff', roles: ['Staff'] } as any;
// Quyền mặc định của Manager (Core-be) — response đăng nhập / GET /users/me luôn kèm.
const manager = {
  role: 'Manager',
  roles: ['Manager'],
  permissions: [
    'shift.assignment.read',
    'shift.assignment.manage',
    'shift.request.review',
    'attendance.read',
    'attendance.request.process',
    'purchase.read',
    'purchase.create',
    'supplier.read',
    'products.cost.read',
    'sales.order.read',
  ],
} as any;
const owner = { role: 'Admin', roles: ['Admin'] } as any;

describe('Dùng nhanh — tối đa 8 ghim', () => {
  it('chỉ hiện mục được phép, giữ thứ tự ghim và cắt ở 8', () => {
    const keys = ['users', 'pos', 'approvals', 'shift-swap', 'products', 'shift-register', 'shift-pool', 'shift-cash', 'notifications', 'chat', 'schedule'];
    // Staff thuần: 'users' (Admin) và 'approvals' (Quản lý) rơi ra, còn lại lấy 8 mục đầu.
    expect(visiblePins(keys, staff).map((f) => f.key)).toEqual([
      'pos', 'shift-swap', 'products', 'shift-register', 'shift-pool', 'shift-cash', 'notifications', 'chat',
    ]);
  });

  it('bộ ghim mặc định không vượt 8 với mọi vai trò', () => {
    for (const user of [staff, manager, owner]) {
      expect(visiblePins(DEFAULT_PINS.staff, user).length).toBeLessThanOrEqual(MAX_PINS);
      expect(visiblePins(DEFAULT_PINS.admin, user).length).toBeLessThanOrEqual(MAX_PINS);
    }
    // Nhân viên thấy ngay nút Bán hàng; quản lý thấy thêm việc quản lý.
    expect(visiblePins(DEFAULT_PINS.staff, staff)[0].key).toBe('pos');
    expect(visiblePins(DEFAULT_PINS.staff, manager).map((f) => f.key)).toContain('approvals');
  });

  it('nhân viên bán được và xem hàng hoá, hoá đơn cả cửa hàng chỉ từ quản lý trở lên', () => {
    const keys = (u: any) => availableFeatures(u).map((f) => f.key);
    expect(keys(staff)).toEqual(expect.arrayContaining(['pos', 'products']));
    expect(keys(staff)).not.toContain('invoices');
    expect(keys(manager)).toContain('invoices');
    // Vai trò tuỳ chỉnh "Thu ngân trưởng" được cấp xem hoá đơn thì thấy.
    expect(keys({ ...staff, permissions: ['sales.order.read'] })).toContain('invoices');
  });

  it('Nhập hàng theo quyền purchase.read: Manager, Admin mặc định; "Thủ kho" được cấp thì thấy, nhân viên thường không', () => {
    const keys = (u: any) => availableFeatures(u).map((f) => f.key);
    expect(keys(manager)).toContain('purchase-orders');
    expect(keys(owner)).toContain('purchase-orders');
    expect(keys(staff)).not.toContain('purchase-orders');
    expect(keys({ ...staff, permissions: ['purchase.read', 'purchase.receive'] })).toContain('purchase-orders');
  });
});

describe('ngữ cảnh hiện tiện ích: loại hình chi nhánh + tính năng cửa hàng', () => {
  const fnbStore = { ...staff, enabledFeatures: ['commerce.retail.pos', FNB_POS_FEATURE] };
  const retailStore = { ...staff, enabledFeatures: ['commerce.retail.pos'] };
  // Tiện ích giả theo loại hình — danh mục thật chưa đăng ký mục F&B nào.
  const fnbItem: FeatureItem = { key: 'x-fnb', label: 'F&B', icon: 'silverware-fork-knife', href: '/x', group: 'sales', visible: (_u, ctx) => fnbVisible(ctx) };

  it('visible() nhận loại hình chi nhánh đang làm việc và tính năng cửa hàng bật', () => {
    const seen: unknown[] = [];
    const probe: FeatureItem = { ...fnbItem, visible: (u, ctx) => (seen.push([u, ctx]), true) };
    const ctx = featureContext(fnbStore, 'fnb');
    expect(ctx).toEqual({ branchType: 'fnb', enabledFeatures: ['commerce.retail.pos', FNB_POS_FEATURE] });
    expect(isFeatureVisible(probe, fnbStore, ctx)).toBe(true);
    expect(seen).toEqual([[fnbStore, ctx]]);
  });

  it('F&B chỉ hiện khi cửa hàng có khoá tính năng VÀ chi nhánh đang làm việc là F&B', () => {
    expect(isFeatureVisible(fnbItem, fnbStore, featureContext(fnbStore, 'fnb'))).toBe(true);
    expect(isFeatureVisible(fnbItem, fnbStore, featureContext(fnbStore, 'retail'))).toBe(false);
    expect(isFeatureVisible(fnbItem, retailStore, featureContext(retailStore, 'fnb'))).toBe(false);
  });

  it('thiếu thông tin thì ẩn: chưa chọn chi nhánh, chưa biết tính năng cửa hàng, không truyền ngữ cảnh', () => {
    expect(isFeatureVisible(fnbItem, fnbStore, featureContext(fnbStore, null))).toBe(false);
    expect(isFeatureVisible(fnbItem, staff, featureContext(staff, 'fnb'))).toBe(false);
    expect(isFeatureVisible(fnbItem, fnbStore)).toBe(false);
    expect(hasStoreFeature(featureContext(staff, 'fnb'), FNB_POS_FEATURE)).toBe(false);
    expect(featureContext(null)).toEqual({ branchType: null, enabledFeatures: null });
  });

  it('vai trò vẫn được kiểm trước điều kiện theo ngữ cảnh', () => {
    const managerOnly: FeatureItem = { ...fnbItem, roles: ['Manager', 'Admin'] };
    expect(isFeatureVisible(managerOnly, fnbStore, featureContext(fnbStore, 'fnb'))).toBe(false);
    const fnbManager = { ...manager, enabledFeatures: [FNB_POS_FEATURE] };
    expect(isFeatureVisible(managerOnly, fnbManager, featureContext(fnbManager, 'fnb'))).toBe(true);
  });

  it('chưa đăng ký tiện ích F&B nào; danh sách tiện ích không đổi theo loại hình chi nhánh', () => {
    expect(FEATURE_REGISTRY.filter((f) => /fnb|f&b/i.test(`${f.key} ${f.label} ${f.href}`))).toEqual([]);
    const keys = (type: 'retail' | 'fnb' | null) => availableFeatures(fnbStore, featureContext(fnbStore, type)).map((f) => f.key);
    expect(keys('fnb')).toEqual(keys('retail'));
    expect(keys(null)).toEqual(keys('retail'));
    expect(visiblePins(DEFAULT_PINS.staff, fnbStore, featureContext(fnbStore, 'fnb')).map((f) => f.key)).toEqual(
      visiblePins(DEFAULT_PINS.staff, fnbStore).map((f) => f.key)
    );
  });
});

// Thư viện đầu việc / xây checklist vệ sinh: core-be (CleaningController) và core-fe cho cả quản lý — trước đây ô chỉ
// hiện với Admin trong khi route /manage/* vẫn mở cho quản lý (vào được bằng link nhưng không thấy ô).
describe('vệ sinh — khớp quyền core-be', () => {
  it('quản lý và Admin thấy thư viện đầu việc và xây checklist, nhân viên thì không', () => {
    const keys = (u: any) => availableFeatures(u).map((f) => f.key);
    for (const user of [manager, owner]) {
      expect(keys(user)).toEqual(expect.arrayContaining(['cleaning-tasks', 'cleaning-builder']));
    }
    expect(keys(staff)).not.toContain('cleaning-tasks');
    expect(keys(staff)).not.toContain('cleaning-builder');
  });
});

// Báo cáo trong stack Quản trị theo quyền analytics.* (Core-be /reports/*): chủ cửa hàng thấy hết; vai trò tuỳ chỉnh
// ("Kế toán") thấy đúng màn mà mình có đủ quyền của các API màn đó gọi.
describe('báo cáo theo quyền', () => {
  const keys = (u: any) => availableFeatures(u).map((f) => f.key);
  const reportKeys = ['revenue-report', 'financial-overview', 'break-even-report'];

  it('Admin thấy mọi báo cáo; nhân viên thường không thấy', () => {
    expect(keys(owner)).toEqual(expect.arrayContaining(reportKeys));
    reportKeys.forEach((k) => expect(keys(staff)).not.toContain(k));
  });

  it('"Kế toán" có quyền doanh thu + phương thức thanh toán chỉ thấy Doanh thu', () => {
    const accountant = { ...staff, permissions: ['analytics.revenue.read', 'analytics.payment-method.read'] };
    expect(keys(accountant)).toContain('revenue-report');
    expect(keys(accountant)).not.toContain('financial-overview');
    expect(keys(accountant)).not.toContain('break-even-report');
  });
});

// ----------------------------------------------------------------------
// Chạm thông báo → mở trang nào (phần thuần, test được). actionUrl của thông báo là đường dẫn web (/dashboard/...): trang có
// màn tương ứng trên app thì mở màn đó; không có thì mở trang chi tiết, ở đó có nút mở trên web của cửa hàng.
// ----------------------------------------------------------------------

const APP_ROUTES: Record<string, string> = {
  '/dashboard/attendance/assignments': '/manage/schedule',
  '/dashboard/attendance/face-enrollment': '/face-enrollment',
  '/dashboard/attendance/logs': '/(tabs)/admin/attendance-report',
  '/dashboard/attendance/my-logs': '/attendance',
  '/dashboard/attendance/my-schedule': '/(tabs)/schedule',
  '/dashboard/attendance/requests': '/manage/approvals',
  '/dashboard/attendance/shift-registration': '/shift-register',
  '/dashboard/cleaning/assigned': '/manage/cleaning-tasks',
  '/dashboard/cleaning/my-checklist': '/cleaning',
  '/dashboard/cleaning/review': '/manage/cleaning-review',
  '/dashboard/hr/contracts': '/hr/contracts',
  '/dashboard/hr/leave': '/hr/leave',
  '/dashboard/hr/performance': '/hr/performance',
  '/dashboard/hr/policies': '/hr/policies',
  '/dashboard/hr/records': '/hr/records',
  '/dashboard/hr/targets': '/hr',
  '/dashboard/hr/violations': '/hr/violations',
  '/dashboard/inspection': '/inspection',
  '/dashboard/inspection/my-faults': '/inspection/faults',
  '/dashboard/late-cover/my-requests': '/shift-pool',
  '/dashboard/late-cover/pending': '/manage/approvals',
  '/dashboard/payroll/complaints': '/(tabs)/admin/payroll',
  '/dashboard/payroll/my-payroll': '/(tabs)/payroll',
  '/dashboard/pos/inventory/shift-checks': '/hr/stock-check',
  '/dashboard/pos/report/dashboard': '/(tabs)/admin',
  '/dashboard/pos/sales-order/list': '/(tabs)/invoices',
  '/dashboard/salary/history': '/(tabs)/payroll',
  '/dashboard/shift-cash': '/shift-cash',
  '/dashboard/shift-pool': '/shift-pool',
  '/dashboard/shift-pool/my-claims': '/shift-pool',
  '/dashboard/shift-pool/my-posts': '/shift-pool',
  '/dashboard/shift-pool/pending': '/manage/approvals',
  '/dashboard/shift-swap/my-confirmation-requests': '/shift-swap',
  '/dashboard/shift-swap/my-requests': '/shift-swap',
  '/dashboard/shift-swap/pending': '/manage/approvals',
  '/dashboard/user/account': '/(tabs)/profile',
};

/** Mọi màn app được nhắm tới, để test giữ cho không trỏ tới màn đã đổi tên. */
export const NOTIFICATION_APP_ROUTES: readonly string[] = [...new Set(Object.values(APP_ROUTES))];

/** Chỉ nhận đường dẫn trong trang quản trị của cửa hàng, không nhận link ra ngoài. */
function dashboardPath(actionUrl: unknown): string | null {
  if (typeof actionUrl !== 'string') return null;
  const url = actionUrl.trim();
  if (!/^\/dashboard(\/[\w\-./]*)?(\?[\w\-.=&%]*)?$/.test(url) || url.includes('..')) return null;
  return url;
}

/** Màn trên app của thông báo; null = không có màn tương ứng, mở trang chi tiết. */
export function notificationAppRoute(actionUrl: unknown): string | null {
  const path = dashboardPath(actionUrl)?.split('?')[0].replace(/\/+$/, '');
  return path ? (APP_ROUTES[path] ?? null) : null;
}

/** URL trên web của cửa hàng cho nút "Mở trên web"; không có gốc web hoặc đường dẫn lạ → null. */
export function notificationWebUrl(actionUrl: unknown, webOrigin: string | null | undefined): string | null {
  const path = dashboardPath(actionUrl);
  const origin = (webOrigin ?? '').trim().replace(/\/+$/, '');
  if (!path || !/^https?:\/\/[^/?#\s]+$/i.test(origin)) return null;
  return `${origin}${path}`;
}

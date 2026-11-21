// ----------------------------------------------------------------------
// Chạm thông báo → mở trang nào (phần thuần, test được). actionUrl của thông báo là đường dẫn web (/dashboard/...): trang có
// màn tương ứng trên app thì mở màn đó; không có thì mở trang chi tiết, ở đó có nút mở trên web của cửa hàng.
// ----------------------------------------------------------------------

import { pushDataRecord } from './push-store';

const APP_ROUTES: Record<string, string> = {
  // Agent xin duyệt lệnh ghi (K3); thông báo có data.agentActionId thì mở thẳng phiếu (notificationTargetRoute).
  '/dashboard/agent/approvals': '/agent/approvals',
  // Trung tâm Agent (K4): việc chờ người / lỗi / xong; có mã việc (data.agentTaskId hoặc ?task=) thì mở thẳng việc đó.
  '/dashboard/agent/center': '/agent/tasks',
  '/dashboard/attendance/assignments': '/manage/schedule',
  '/dashboard/attendance/face-enrollment': '/face-enrollment',
  '/dashboard/attendance/logs': '/(tabs)/admin/attendance-report',
  '/dashboard/attendance/my-logs': '/attendance',
  '/dashboard/attendance/my-schedule': '/(tabs)/schedule',
  '/dashboard/attendance/requests': '/manage/approvals',
  '/dashboard/attendance/shift-registration': '/shift-register',
  // Chỉ thông báo "nhân viên đã nộp việc giao riêng" dẫn tới trang này (core-be WorkTaskFeature.ManageUrl).
  // → Công việc › Chấm việc giao (màn "Chấm việc giao" cũ đã gộp vào Công việc).
  '/dashboard/cleaning/assigned': '/manage/work-center/task-review',
  '/dashboard/cleaning/my-checklist': '/cleaning',
  '/dashboard/cleaning/review': '/manage/work-center/shift-review',
  '/dashboard/hr/contracts': '/hr/contracts',
  '/dashboard/hr/leave': '/hr/leave',
  '/dashboard/hr/performance': '/hr/performance',
  '/dashboard/hr/policies': '/hr/policies',
  '/dashboard/hr/records': '/hr/records',
  '/dashboard/hr/targets': '/hr',
  '/dashboard/hr/violations': '/hr/violations',
  // Hộp thư khách (thông báo loại Conversation): có ?c=<mã hội thoại> thì mở thẳng hội thoại (notificationTargetRoute).
  '/dashboard/inbox': '/inbox',
  '/dashboard/inspection': '/inspection',
  '/dashboard/inspection/my-faults': '/inspection/faults',
  '/dashboard/late-cover/my-requests': '/shift-pool',
  '/dashboard/late-cover/pending': '/manage/approvals',
  '/dashboard/payroll/complaints': '/(tabs)/admin/payroll-complaints',
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

/** Mã phiếu agent (GUID) trong data của thông báo / push — core-be gửi data {"agentActionId": "<id>"}. */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mã phiếu agent xin duyệt trong data (object hoặc chuỗi JSON); không có / không phải GUID → null. */
export function agentActionIdOf(data: unknown): string | null {
  const id = pushDataRecord(data).agentActionId;
  return typeof id === 'string' && GUID.test(id.trim()) ? id.trim() : null;
}

/** Mã việc của agent (K4) trong data (object hoặc chuỗi JSON) — core-be gửi data {"agentTaskId": "<id>"}; không phải GUID → null. */
export function agentTaskIdOf(data: unknown): string | null {
  const id = pushDataRecord(data).agentTaskId;
  return typeof id === 'string' && GUID.test(id.trim()) ? id.trim() : null;
}

const AGENT_CENTER_PATH = '/dashboard/agent/center';

/** Mã việc trong actionUrl /dashboard/agent/center?task=<id>; đường dẫn khác / không có / không phải GUID → null. */
export function agentTaskIdFromUrl(actionUrl: unknown): string | null {
  const url = dashboardPath(actionUrl);
  if (!url) return null;
  const [path, query = ''] = url.split('?');
  if (path.replace(/\/+$/, '') !== AGENT_CENTER_PATH) return null;
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key !== 'task') continue;
    let id = value;
    try {
      id = decodeURIComponent(value);
    } catch {
      return null;
    }
    return GUID.test(id.trim()) ? id.trim() : null;
  }
  return null;
}

const INBOX_PATH = '/dashboard/inbox';

/** Mã hội thoại trong actionUrl /dashboard/inbox?c=<id> (thông báo loại Conversation); khác / không phải GUID → null. */
export function inboxConversationIdFromUrl(actionUrl: unknown): string | null {
  const url = dashboardPath(actionUrl);
  if (!url) return null;
  const [path, query = ''] = url.split('?');
  if (path.replace(/\/+$/, '') !== INBOX_PATH) return null;
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key !== 'c') continue;
    let id = value;
    try {
      id = decodeURIComponent(value);
    } catch {
      return null;
    }
    return GUID.test(id.trim()) ? id.trim() : null;
  }
  return null;
}

/**
 * Màn mở khi chạm thông báo (trong app hoặc push), theo thứ tự: phiếu agent xin duyệt (data.agentActionId) → chi tiết phiếu;
 * việc của agent (data.agentTaskId, hoặc actionUrl /dashboard/agent/center?task=<id>) → chi tiết việc; hội thoại hộp thư
 * khách (actionUrl /dashboard/inbox?c=<id>) → hội thoại; còn lại theo
 * actionUrl (notificationAppRoute — /dashboard/agent/center không có mã việc → danh sách việc). null = không có màn tương ứng.
 */
export function notificationTargetRoute(actionUrl: unknown, data?: unknown): string | null {
  const agentActionId = agentActionIdOf(data);
  if (agentActionId) return `/agent/approvals/${agentActionId}`;
  const agentTaskId = agentTaskIdOf(data) ?? agentTaskIdFromUrl(actionUrl);
  if (agentTaskId) return `/agent/tasks/${agentTaskId}`;
  const conversationId = inboxConversationIdFromUrl(actionUrl);
  if (conversationId) return `/inbox/${conversationId}`;
  return notificationAppRoute(actionUrl);
}

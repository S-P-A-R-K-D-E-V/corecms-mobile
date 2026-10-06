import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

// ----------------------------------------------------------------------

import { getHostApi } from 'src/services/store-config';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, restoreSession, type RestoreOutcome } from './session';

export { getHostApi };

const axiosInstance = axios.create({ baseURL: getHostApi() });

type AuthRetryConfig = InternalAxiosRequestConfig & {
  /** Token đã gắn khi gửi (để biết 401 là do token cũ hay token hiện tại). */
  _sentToken?: string | null;
  /** Đã thử lại sau 401 một lần — lần này 401 nữa thì thôi. */
  _authRetry?: boolean;
};

// Attach JWT token to every request
axiosInstance.interceptors.request.use(async (config: AuthRetryConfig) => {
  // Bản app cửa hàng: gốc API đổi theo cửa hàng người dùng chọn lúc chạy (store-config).
  config.baseURL = getHostApi();
  // SecureStore là nguồn duy nhất: không còn token thì không gửi header cũ còn sót trong defaults.
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    config.headers.delete('Authorization');
  }
  config._sentToken = token;
  return config;
});

// ----------------------------------------------------------------------
// Hết phiên giữa chừng: AuthProvider đăng ký hàm này để chuyển về "chưa đăng nhập" (LOGOUT). axios
// không tự điều hướng — các cổng (index, InternalAppGuard) đưa về trang đăng nhập của cửa hàng đã nhớ.
// ----------------------------------------------------------------------

let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

/** /auth/* cho phép gọi khi chưa đăng nhập: 401 ở đây là sai thông tin đăng nhập, không phải hết phiên. */
const ANONYMOUS_AUTH_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/verify-otp',
  '/auth/resend-otp',
  '/auth/restore-session',
  '/auth/oauth-login',
  '/auth/sso/exchange',
  '/auth/refresh-token',
]);

export function isAnonymousAuthPath(url: string | undefined): boolean {
  if (!url) return false;
  const path = url
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/api(?=\/)/, '')
    .split(/[?#]/)[0]!
    .replace(/\/+$/, '')
    .toLowerCase();
  return ANONYMOUS_AUTH_PATHS.has(path);
}

/**
 * 401 giữa phiên (accessToken hết hạn, hoặc BE đổi trạng thái tài khoản giữa phiên): khôi phục phiên
 * bằng sessionToken (một lần cho mọi request đang 401) rồi gửi lại request đó MỘT lần.
 *   - khôi phục được            → gửi lại với token mới.
 *   - server từ chối phiên (4xx) → token đã xoá, báo AuthProvider đăng xuất (cửa hàng vẫn nhớ).
 *   - mất mạng / 5xx             → giữ nguyên token, chỉ trả lỗi request này.
 * Trả về null = không gửi lại, để request lỗi như bình thường.
 */
async function recoverFrom401(config: AuthRetryConfig) {
  config._authRetry = true;

  // Request đã gửi bằng token cũ, trong lúc đó token đã được làm mới → gửi lại luôn, không khôi phục nữa.
  const current = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (current && current !== config._sentToken) return axiosInstance(config);

  let outcome: RestoreOutcome;
  try {
    outcome = await restoreSession();
  } catch {
    return null; // mất mạng / server lỗi — giữ phiên
  }

  switch (outcome.kind) {
    case 'restored':
      return axiosInstance(config);
    case 'rejected':
      onSessionExpired?.();
      return null;
    case 'none':
      // Không có phiên để khôi phục mà token đang dùng bị từ chối → coi như hết phiên.
      if (config._sentToken) {
        await Promise.all([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY].map((k) => SecureStore.deleteItemAsync(k)));
        onSessionExpired?.();
      }
      return null;
    default:
      return null; // 'stale': đã đăng xuất / đổi cửa hàng trong lúc chờ
  }
}

axiosInstance.interceptors.response.use(
  (res) => res,
  async (error) => {
    const config = error?.config as AuthRetryConfig | undefined;
    if (error?.response?.status === 401 && config && !config._authRetry && !isAnonymousAuthPath(config.url)) {
      const retried = await recoverFrom401(config);
      if (retried) return retried;
    }
    return Promise.reject((error.response && error.response.data) || 'Something went wrong');
  }
);

export default axiosInstance;

// ----------------------------------------------------------------------

export const fetcher = async (args: string | [string, AxiosRequestConfig]) => {
  const [url, config] = Array.isArray(args) ? args : [args];
  const res = await axiosInstance.get(url, { ...config });
  return res.data;
};

// ----------------------------------------------------------------------

export const endpoints = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    logout: '/auth/logout',
    refreshToken: '/auth/refresh-token',
    verifyOtp: '/auth/verify-otp',
    resendOtp: '/auth/resend-otp',
    restoreSession: '/auth/restore-session',
    oauthLogin: '/auth/oauth-login',
    ssoExchange: '/auth/sso/exchange',
    oauthConnect: '/auth/oauth-connect',
    oauthConnections: '/auth/oauth-connections',
    // Gỡ theo id liên kết (mỗi loại một liên kết; tài khoản cũ có thể còn nhiều cái cùng loại).
    oauthDisconnect: (id: string) => `/auth/oauth-connections/${id}`,
    // Vé liên kết Google/Apple qua trang auth (xem features/auth/web-link.ts).
    oauthLinkStart: '/auth/oauth-link/start',
    deleteAccount: '/auth/account',
  },
  users: {
    list: '/users',
    activeStaff: '/users/active-staff',
    details: (id: string) => `/users/${id}`,
    changeStatus: (id: string) => `/users/${id}/status`,
    schedulingPriority: (id: string) => `/users/${id}/scheduling-priority`,
    me: '/users/me',
    updateProfile: '/users/me/profile',
    changePassword: '/users/me/change-password',
    uploadAvatar: '/users/me/avatar',
    uploadMyIdCard: '/users/me/id-card',
  },
  roles: {
    list: '/roles',
    assign: '/roles/assign',
  },
  shifts: {
    list: '/shifts',
    details: (id: string) => `/shifts/${id}`,
  },
  shiftTemplates: {
    list: '/shift-templates',
    details: (id: string) => `/shift-templates/${id}`,
  },
  shiftSchedules: {
    list: '/shift-schedules/range',
    details: (id: string) => `/shift-schedules/${id}`,
  },
  shiftAssignments: {
    list: '/shift-assignments/range',
    mySchedule: '/shift-assignments/my-schedule',
    byStaffAndDate: (staffId: string, date: string) => `/shift-assignments/staff/${staffId}/date/${date}`,
    byStaffAndDateRange: (staffId: string) => `/shift-assignments/staff/${staffId}/range`,
    manageShift: '/shift-assignments/manage-shift',
    bulkAssign: '/shift-assignments/bulk',
    autoAssignApply: '/shift-assignments/auto-assign-apply',
    swap: '/shift-assignments/swap',
  },
  attendance: {
    checkIn: '/attendance/check-in',
    checkInFace: '/attendance/check-in-face',
    checkOut: '/attendance/check-out',
    smartCheckIn: '/attendance/smart-check-in',
    smartCheckOut: '/attendance/smart-check-out',
    smartCheckInFace: '/attendance/smart-check-in-face',
    smartCheckOutFace: '/attendance/smart-check-out-face',
    logs: '/attendance/logs',
    myLogs: '/attendance/my-logs',
    requests: '/attendance/requests',
    myRequests: '/attendance/my-requests',
    processRequest: (id: string) => `/attendance/requests/${id}/process`,
    myReport: '/attendance/my-report',
    todayBoard: '/attendance/today-board',
    report: '/attendance/report',
    manualAdjustment: '/attendance/manual-adjustment',
    adjustTime: '/attendance/adjust-time',
  },
  branches: {
    list: '/branches',
  },
  kiosk: {
    pairingClaim: '/kiosk-pairing/claim',
    devices: '/kiosk-devices',
    deviceRevoke: (deviceId: string) => `/kiosk-devices/${deviceId}/revoke`,
  },
  salary: {
    mySalary: '/salary/my-salary',
  },
  payroll: {
    myPayroll: '/payroll/my-payroll',
    myCurrentEstimate: '/payroll/my-current-estimate',
    shiftDetails: (id: string) => `/payroll/${id}/shift-details`,
    penaltyDetails: (id: string) => `/payroll/${id}/penalty-details`,
    // Admin: tính lương
    calculate: '/payroll/calculate',
    generateBatch: '/payroll/generate-batch',
    byCycle: (cycleId: string) => `/payroll/by-cycle/${cycleId}`,
    recalculateCycle: (cycleId: string) => `/payroll/recalculate-cycle/${cycleId}`,
    recalculateRecord: (id: string) => `/payroll/${id}/recalculate`,
    finalize: (id: string) => `/payroll/${id}/finalize`,
    bulkFinalize: '/payroll/bulk-finalize',
    salaryConfigPreview: '/payroll/salary-config-preview',
    waivePenalty: '/payroll/waive-penalty',
    removeWaiver: (waiverId: string) => `/payroll/waive-penalty/${waiverId}`,
    payment: (id: string) => `/payroll/${id}/payment`,
    paymentPrepare: (id: string) => `/payroll/${id}/payment/prepare`,
    markPaid: (id: string) => `/payroll/${id}/mark-paid`,
  },
  payrollCycle: {
    list: '/payroll-cycles',
    create: '/payroll-cycles',
    visibility: (id: string) => `/payroll-cycles/${id}/visibility`,
  },
  salaryConfig: {
    byUser: (userId: string) => `/salary-configurations/user/${userId}`,
    versionedUpsert: '/salary-configurations/versioned-upsert',
  },
  salaryHistory: {
    mySalaryHistory: '/salary-history/my-history',
  },
  shiftRegistrations: {
    register: '/shift-registrations/register',
    unregister: '/shift-registrations/unregister',
    bulkRegister: '/shift-registrations/bulk-register',
    list: '/shift-registrations/range',
    myRegistrations: '/shift-registrations/my-registrations',
  },
  notifications: {
    list: '/notifications',
    unreadCount: '/notifications/unread-count',
    markAsRead: (id: string) => `/notifications/${id}/read`,
    markAllAsRead: '/notifications/read-all',
    detail: (id: string) => `/notifications/${id}`,
    pushToken: '/notifications/push-token',
  },
  chatbot: {
    sessions: '/chatbot/sessions',
    messages: '/chatbot/messages',
    sessionMessages: (sessionId: string) => `/chatbot/sessions/${sessionId}/messages`,
    capabilities: '/chatbot/capabilities',
    // Ảnh gửi trợ lý: xin presigned URL rồi PUT thẳng lên R2 — API chỉ nhận objectKey (JSON), không nhận ảnh.
    presign: (sessionId: string) => `/chatbot/sessions/${sessionId}/attachments/presign`,
    retry: (messageId: string) => `/chatbot/messages/${messageId}/retry`,
  },
  messenger: {
    conversations: '/messenger/conversations',
    openPrivate: '/messenger/conversations/private',
    createGroup: '/messenger/conversations/group',
    members: (conversationId: string) => `/messenger/conversations/${conversationId}/members`,
    member: (conversationId: string, memberId: string) =>
      `/messenger/conversations/${conversationId}/members/${memberId}`,
    messages: (conversationId: string) => `/messenger/conversations/${conversationId}/messages`,
    // Ảnh/tệp chat: xin presigned URL rồi PUT thẳng lên R2 (không gửi multipart qua API nữa).
    attachmentsPresign: (conversationId: string) => `/messenger/conversations/${conversationId}/attachments/presign`,
    markRead: (conversationId: string) => `/messenger/conversations/${conversationId}/read`,
    users: '/messenger/users',
  },
  checkinFace: {
    face: '/checkin/face',
  },
  faceTracking: {
    enrollQuality: '/face-tracking/enroll/quality',
    enrollPresign: '/face-tracking/enroll/presign',
    enrollBatch: '/face-tracking/enroll/batch',
    verifySelf: '/face-tracking/verify-self',
  },
  shiftSwap: {
    create: '/shift-swap',
    myRequests: '/shift-swap/my-requests',
    myConfirmationRequests: '/shift-swap/my-confirmation-requests',
    targetConfirm: (id: string) => `/shift-swap/${id}/target-confirm`,
    pending: '/shift-swap/pending',
    review: (id: string) => `/shift-swap/${id}/review`,
  },
  lateCover: {
    pending: '/late-cover/pending',
    review: (id: string) => `/late-cover/${id}/review`,
  },
  shiftPool: {
    create: '/shift-pool',
    open: '/shift-pool/open',
    myPosts: '/shift-pool/my-posts',
    myClaims: '/shift-pool/my-claims',
    pending: '/shift-pool/pending',
    claim: (id: string) => `/shift-pool/${id}/claim`,
    cancel: (id: string) => `/shift-pool/${id}/cancel`,
    review: (id: string) => `/shift-pool/${id}/review`,
  },
  shiftCash: {
    summary: '/shift-cash/summary',
    transactions: '/shift-cash/transactions',
    transactionDetail: (id: string) => `/shift-cash/transactions/${id}`,
    denominationsBatch: '/shift-cash/denominations/batch',
    finalize: '/shift-cash/finalize',
    open: '/shift-cash/open',
  },
  kiotViet: {
    dailySummary: '/kiotviet/daily-summary',
    retryStockAdjustment: (id: string) => `/kiotviet/push/stock-adjustments/${id}/retry`,
  },
  reports: {
    dashboard: '/reports/dashboard',
    revenue: '/reports/revenue',
    paymentMethods: '/reports/payment-methods',
    expenses: '/reports/expenses',
    breakEven: '/reports/break-even',
  },
  cleaning: {
    myChecklist: '/cleaning/my-checklist',
    completeTask: (id: string) => `/cleaning/tasks/${id}/complete`,
    presignPhotos: (id: string) => `/cleaning/tasks/${id}/photos/presign`,
    checklist: '/cleaning/checklist',
    reviewTask: (id: string) => `/cleaning/tasks/${id}/review`,
    shiftStaff: (id: string) => `/cleaning/tasks/${id}/shift-staff`,
    createPenalty: (id: string) => `/cleaning/tasks/${id}/penalties`,
    voidPenalty: (id: string) => `/cleaning/penalties/${id}/void`,
    weekOverview: '/cleaning/week-overview',
    taskDefinitions: '/cleaning/task-definitions',
    taskDefinitionDetails: (id: string) => `/cleaning/task-definitions/${id}`,
    templates: '/cleaning/templates',
    templateDetails: (id: string) => `/cleaning/templates/${id}`,
    templateWeek: '/cleaning/templates/week',
    duplicateWeek: '/cleaning/templates/duplicate-week',
  },
  // ── ERP trên app: hàng hoá, hoá đơn, nhập hàng, bán hàng ──
  products: {
    list: '/products',
    details: (id: string) => `/products/${id}`,
    children: (id: string) => `/products/${id}/children`,
    stockAdjustments: (id: string) => `/products/${id}/stock-adjustments`,
  },
  categories: { list: '/categories' },
  salesOrders: {
    list: '/sales-orders',
    details: (id: string) => `/sales-orders/${id}`,
    create: '/sales-orders',
  },
  purchaseOrders: {
    list: '/purchase-orders',
    details: (id: string) => `/purchase-orders/${id}`,
    create: '/purchase-orders',
    confirm: (id: string) => `/purchase-orders/${id}/confirm`,
    receive: (id: string) => `/purchase-orders/${id}/receive`,
  },
  warehouses: { list: '/warehouses' },
  suppliers: { list: '/suppliers' },
  bankAccounts: { list: '/bank-accounts' },
  // ── F&B: thực đơn, sơ đồ bàn, đơn mở, phiếu bar (contract F&B POS v1) ──
  fnb: {
    menu: '/fnb/menu',
    floor: '/fnb/floor',
    sync: '/fnb/sync',
    order: (id: string) => `/fnb/orders/${id}`,
    orderInfo: (id: string) => `/fnb/orders/${id}/info`,
    orderLines: (id: string) => `/fnb/orders/${id}/lines`,
    orderLine: (id: string, lineId: string) => `/fnb/orders/${id}/lines/${lineId}`,
    orderSend: (id: string) => `/fnb/orders/${id}/send`,
    orderVoid: (id: string) => `/fnb/orders/${id}/void`,
    orderMove: (id: string) => `/fnb/orders/${id}/move`,
    orderBill: (id: string) => `/fnb/orders/${id}/bill`,
    orderCheckout: (id: string) => `/fnb/orders/${id}/checkout`,
    orderCancel: (id: string) => `/fnb/orders/${id}/cancel`,
    ticketPrintResult: (id: string) => `/fnb/kitchen-tickets/${id}/print-result`,
  },
};

// ----------------------------------------------------------------------

// Object key (R2/S3) → URL hiển thị được, proxy qua API /media/{key}
export function getStorageUrl(path?: string | null): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${getHostApi()}/media/${path}`;
}

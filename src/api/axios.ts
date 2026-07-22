import axios, { AxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

// ----------------------------------------------------------------------

export const HOST_API = process.env.EXPO_PUBLIC_HOST_API ?? 'http://localhost:2510';

const axiosInstance = axios.create({ baseURL: HOST_API });

// Attach JWT token to every request
axiosInstance.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (res) => res,
  async (error) => {
    // BE re-kiểm tra status mỗi request (banned/pending giữa phiên trả 401 dù
    // access token còn hạn). Đăng xuất ngay thay vì để app lặp lỗi API cho
    // tới khi hết hạn tự nhiên. Các thao tác dưới đây là idempotent nên vô
    // hại nếu nhiều request cùng lúc bị 401 và cùng chạy vào nhánh này.
    if (error?.response?.status === 401) {
      const hadToken = await SecureStore.getItemAsync('accessToken');
      if (hadToken) {
        await SecureStore.deleteItemAsync('accessToken');
        await SecureStore.deleteItemAsync('refreshToken');
        delete axiosInstance.defaults.headers.common.Authorization;
        router.replace('/(auth)/login');
      }
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
    checkOut: '/attendance/check-out',
    smartCheckIn: '/attendance/smart-check-in',
    smartCheckOut: '/attendance/smart-check-out',
    logs: '/attendance/logs',
    myLogs: '/attendance/my-logs',
    requests: '/attendance/requests',
    myRequests: '/attendance/my-requests',
    processRequest: (id: string) => `/attendance/requests/${id}/process`,
    myReport: '/attendance/my-report',
    report: '/attendance/report',
    manualAdjustment: '/attendance/manual-adjustment',
    adjustTime: '/attendance/adjust-time',
  },
  branches: {
    list: '/branches',
  },
  salary: {
    mySalary: '/salary/my-salary',
  },
  payroll: {
    myPayroll: '/payroll/my-payroll',
    shiftDetails: (id: string) => `/payroll/${id}/shift-details`,
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
  messenger: {
    conversations: '/messenger/conversations',
    openPrivate: '/messenger/conversations/private',
    createGroup: '/messenger/conversations/group',
    members: (conversationId: string) => `/messenger/conversations/${conversationId}/members`,
    member: (conversationId: string, memberId: string) =>
      `/messenger/conversations/${conversationId}/members/${memberId}`,
    messages: (conversationId: string) => `/messenger/conversations/${conversationId}/messages`,
    attachments: (conversationId: string) => `/messenger/conversations/${conversationId}/attachments`,
    markRead: (conversationId: string) => `/messenger/conversations/${conversationId}/read`,
    users: '/messenger/users',
  },
  checkinFace: {
    face: '/checkin/face',
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
  },
  reports: {
    dashboard: '/reports/dashboard',
    revenue: '/reports/revenue',
    paymentMethods: '/reports/payment-methods',
    expenses: '/reports/expenses',
    breakEven: '/reports/break-even',
  },
};

// ----------------------------------------------------------------------

// Object key (R2/S3) → URL hiển thị được, proxy qua API /media/{key}
export function getStorageUrl(path?: string | null): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${HOST_API}/media/${path}`;
}

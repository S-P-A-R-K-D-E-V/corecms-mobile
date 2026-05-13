import axios, { AxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

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
  (error) => Promise.reject((error.response && error.response.data) || 'Something went wrong')
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
  },
  users: {
    list: '/users',
    details: (id: string) => `/users/${id}`,
    me: '/users/me',
    updateProfile: '/users/me/profile',
    changePassword: '/users/me/change-password',
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
  },
  messenger: {
    conversations: '/messenger/conversations',
    openPrivate: '/messenger/conversations/private',
    createGroup: '/messenger/conversations/group',
    members: (conversationId: string) => `/messenger/conversations/${conversationId}/members`,
    member: (conversationId: string, memberId: string) =>
      `/messenger/conversations/${conversationId}/members/${memberId}`,
    messages: (conversationId: string) => `/messenger/conversations/${conversationId}/messages`,
    markRead: (conversationId: string) => `/messenger/conversations/${conversationId}/read`,
    users: '/messenger/users',
  },
  checkinFace: {
    face: '/checkin/face',
  },
};

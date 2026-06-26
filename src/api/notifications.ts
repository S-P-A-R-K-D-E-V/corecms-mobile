import axios, { endpoints } from './axios';

// ----------------------------------------------------------------------

export interface INotification {
  id: string;
  title: string;
  body: string;
  type: string;
  category?: string;
  isRead: boolean;
  createdAt: string;
  createdByName?: string;
  actionUrl?: string;
  data?: unknown;
}

export interface IUnreadCountResponse {
  count: number;
}

// BE trả về wrapper phân trang (NotificationListResponse), không phải mảng phẳng.
interface RawNotification {
  notificationId: string;
  title: string;
  message: string;
  category: string;
  actionUrl?: string | null;
  data?: unknown;
  isRead: boolean;
  readAt?: string | null;
  createdByName?: string | null;
  createdAt: string;
}
interface NotificationListResponse {
  items: RawNotification[];
  totalCount: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}

function mapNotification(r: RawNotification): INotification {
  return {
    id: r.notificationId,
    title: r.title,
    body: r.message,
    type: r.category,
    category: r.category,
    isRead: r.isRead,
    createdAt: r.createdAt,
    createdByName: r.createdByName ?? undefined,
    actionUrl: r.actionUrl ?? undefined,
    data: r.data,
  };
}

// ----------------------------------------------------------------------

export async function getNotifications(page = 1, pageSize = 50): Promise<INotification[]> {
  const response = await axios.get<NotificationListResponse>(endpoints.notifications.list, {
    params: { page, pageSize },
  });
  return (response.data?.items ?? []).map(mapNotification);
}

export async function getUnreadCount(): Promise<number> {
  const response = await axios.get<IUnreadCountResponse>(endpoints.notifications.unreadCount);
  return response.data.count;
}

export async function markAsRead(id: string): Promise<void> {
  await axios.put(endpoints.notifications.markAsRead(id));
}

export async function markAllAsRead(): Promise<void> {
  await axios.put(endpoints.notifications.markAllAsRead);
}

export async function deleteNotification(id: string): Promise<void> {
  await axios.delete(endpoints.notifications.detail(id));
}

/** Xoá tất cả thông báo của tôi — BE chưa có endpoint "delete all" nên xoá lần lượt. */
export async function deleteAllNotifications(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteNotification(id).catch(() => undefined)));
}

export async function registerPushToken(token: string, platform: string): Promise<void> {
  await axios.post(endpoints.notifications.pushToken, { token, platform });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await axios.delete(endpoints.notifications.pushToken, { data: { token } });
}

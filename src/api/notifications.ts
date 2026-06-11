import axios, { endpoints } from './axios';

// ----------------------------------------------------------------------

export interface INotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  category?: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

export interface IUnreadCountResponse {
  count: number;
}

// ----------------------------------------------------------------------

export async function getNotifications(): Promise<INotification[]> {
  const response = await axios.get<INotification[]>(endpoints.notifications.list);
  return response.data;
}

export async function getUnreadCount(): Promise<number> {
  const response = await axios.get<IUnreadCountResponse>(endpoints.notifications.unreadCount);
  return response.data.count;
}

export async function markAsRead(id: string): Promise<void> {
  await axios.patch(endpoints.notifications.markAsRead(id));
}

export async function markAllAsRead(): Promise<void> {
  await axios.patch(endpoints.notifications.markAllAsRead);
}

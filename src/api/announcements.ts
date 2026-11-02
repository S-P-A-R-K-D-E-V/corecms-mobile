import axios, { endpoints } from './axios';

// ----------------------------------------------------------------------
// Popup thông báo (core-be AnnouncementsController): phần của nhân viên. Tạo, sửa, xem ai đã đọc làm trên web.
// ----------------------------------------------------------------------

export type AnnouncementSeverity = 'Info' | 'Warn' | 'Critical';

export type IPendingAnnouncement = {
  id: string;
  title: string;
  bodyMarkdown: string;
  severity: AnnouncementSeverity;
  requireAck: boolean;
  startAt: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  /** Đường dẫn /media đã ký, có hạn; ghép bằng getStorageUrl. */
  imageUrl?: string | null;
};

export async function getPendingAnnouncements(): Promise<IPendingAnnouncement[]> {
  const response = await axios.get<IPendingAnnouncement[]>(endpoints.announcements.pending);
  return response.data;
}

/** Link ảnh mới cho popup đang mở, khi link cũ đã hết hạn. */
export async function getAnnouncementImageUrl(id: string): Promise<string | null> {
  const response = await axios.get<{ imageUrl: string | null }>(endpoints.announcements.imageUrl(id));
  return response.data.imageUrl;
}

export async function markAnnouncementSeen(id: string): Promise<void> {
  await axios.post(endpoints.announcements.seen(id));
}

export async function acknowledgeAnnouncement(id: string): Promise<void> {
  await axios.post(endpoints.announcements.ack(id));
}

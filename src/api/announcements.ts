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
};

export async function getPendingAnnouncements(): Promise<IPendingAnnouncement[]> {
  const response = await axios.get<IPendingAnnouncement[]>(endpoints.announcements.pending);
  return response.data;
}

export async function markAnnouncementSeen(id: string): Promise<void> {
  await axios.post(endpoints.announcements.seen(id));
}

export async function acknowledgeAnnouncement(id: string): Promise<void> {
  await axios.post(endpoints.announcements.ack(id));
}

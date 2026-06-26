import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import dayjs from 'dayjs';

import type { IMyScheduleItem } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Nhắc ca làm: lên lịch thông báo CỤC BỘ (local) trên máy, fire trước giờ bắt
// đầu ca 30 phút. Local notification vẫn nổ khi app đóng/nền nên không cần BE.
// Mỗi lần đồng bộ: huỷ hết reminder cũ rồi đặt lại theo lịch hiện tại.
// ----------------------------------------------------------------------

const LEAD_MINUTES = 30;
const KIND = 'shift-reminder';

/** Huỷ toàn bộ reminder ca đã đặt trước đó (nhận diện qua data.kind). */
async function cancelExisting(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { kind?: string } | undefined)?.kind === KIND)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Đặt lại reminder cho các ca sắp tới (chưa check-in, giờ fire còn ở tương lai). */
export async function rescheduleShiftReminders(shifts: IMyScheduleItem[], enabled: boolean): Promise<void> {
  try {
    await cancelExisting();
    if (!enabled) return;

    const now = dayjs();
    const seen = new Set<string>();

    for (const s of shifts) {
      if (s.hasCheckedIn) continue; // đã check-in thì không nhắc nữa
      const start = dayjs(`${s.date}T${s.startTime}`);
      if (!start.isValid()) continue;
      const fireAt = start.subtract(LEAD_MINUTES, 'minute');
      if (fireAt.isBefore(now)) continue;

      // Tránh đặt trùng cùng một ca.
      const key = `${s.date}-${s.assignmentId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Sắp đến ca làm',
          body: `Ca ${s.shiftName} bắt đầu lúc ${s.startTime} (còn 30 phút). Nhớ check-in đúng giờ nhé!`,
          data: { kind: KIND, assignmentId: s.assignmentId, category: 'Shift' },
          ...(Platform.OS === 'android' ? {} : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt.toDate(),
          ...(Platform.OS === 'android' ? { channelId: 'shift' } : {}),
        },
      });
    }
  } catch {
    // Không có quyền thông báo / lỗi lịch — bỏ qua, không chặn luồng chính.
  }
}

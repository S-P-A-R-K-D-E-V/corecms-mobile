import { create } from 'zustand';

// Trạng thái kết nối hub hộp thư (tách riêng để hooks.ts và inbox-hub.ts không import vòng).
// joined = đã vào nhóm cửa hàng (nhận sự kiện trực tiếp); joinedAt đổi mỗi lần vào lại → màn đang mở nạp lại phần lỡ.
export type InboxHubState = { joined: boolean; joinedAt: number | null };

export const useInboxHubState = create<InboxHubState>(() => ({ joined: false, joinedAt: null }));

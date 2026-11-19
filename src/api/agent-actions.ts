import axios, { endpoints } from './axios';

// ----------------------------------------------------------------------
// Phiếu agent xin làm lệnh ghi (K3 — cổng duyệt lệnh ghi của agent, core-be AgentActionsController). Khoá agent ở mức
// "chờ duyệt" gửi lệnh ghi → máy chủ lưu nguyên lệnh thành phiếu và báo người có quyền agent.approve. Duyệt = máy chủ
// chạy NGAY đúng lệnh đã lưu (người duyệt là người thực hiện) rồi trả phiếu kèm kết quả; từ chối = không chạy.
// ----------------------------------------------------------------------

export type AgentActionStatus =
  | 'pending'
  | 'approved'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'rejected'
  | 'expired'
  /** Người duyệt bấm "Yêu cầu sửa": lệnh không chạy, agent nhận ghi chú rồi gửi bản mới (phiếu mới). */
  | 'revision_requested';

export interface AgentPreviewChannel {
  id: string;
  /** threads / facebook / instagram … */
  platform: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

export interface AgentPreviewProduct {
  id: string;
  code: string;
  name: string;
  price: number;
  imageUrl: string | null;
  inStock: boolean;
}

/** Bài mạng xã hội agent định đăng, dựng sẵn để hiện như bài thật. */
export interface AgentSocialPostPreview {
  /** draft | queue | schedule | now */
  mode: string;
  /** Câu cho người đọc, vd "Hẹn đăng 19:30 hôm nay (18/11)". */
  modeLabel: string;
  scheduledAt: string | null;
  text: string | null;
  imageUrls: string[];
  channels: AgentPreviewChannel[];
  products: AgentPreviewProduct[];
}

export interface AgentPreviewField {
  label: string;
  value: string;
}

/** Một dòng của lịch đăng bài (phiếu social_batch). */
export interface AgentSocialBatchItem {
  postId: string;
  scheduledAt: string | null;
  /** Bài đã bị sửa sau khi gửi duyệt — dòng này sẽ không được hẹn. */
  changed: boolean;
  /** Bài không còn (đã xoá). */
  missing: boolean;
  post: AgentSocialPostPreview;
}

/** Bản xem trước dễ đọc của phiếu (BE dựng lúc đọc). kind lạ → coi như generic. */
export interface AgentActionPreview {
  kind: 'social_post' | 'social_batch' | 'generic' | (string & {});
  title: string;
  socialPost: AgentSocialPostPreview | null;
  fields: AgentPreviewField[];
  /** Chỉ có khi kind = social_batch: các bài theo giờ đăng. */
  socialBatch?: { items: AgentSocialBatchItem[] } | null;
}

/** Bản trước của cùng việc (phiếu bị "Yêu cầu sửa") — để so chữ / ảnh cũ và mới. */
export interface AgentActionPrevious {
  actionId: string;
  note: string | null;
  decidedByName: string | null;
  preview: AgentActionPreview | null;
}

export interface AgentActionView {
  id: string;
  agentName: string;
  agentApiKeyId: string;
  actsForUserId: string | null;
  actsForName: string | null;
  method: string;
  pathAndQuery: string;
  permission: string;
  /** Tham số của lệnh (chuỗi JSON) hoặc null khi lệnh không có body. */
  bodyJson: string | null;
  summary: string;
  /** Trạng thái phiếu — chuỗi lạ (BE thêm trạng thái mới) vẫn giữ nguyên để hiện. */
  status: AgentActionStatus | (string & {});
  createdAt: string;
  expiresAt: string;
  decidedByUserId: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  executedAt: string | null;
  resultStatusCode: number | null;
  resultBody: string | null;
  /** Tên thao tác tiếng Việt, vd "Tạo bài đăng mạng xã hội" (BE cũ: không có / rỗng → dùng summary). */
  title?: string | null;
  preview?: AgentActionPreview | null;
  /** Phiếu do một việc trên bảng việc tạo (việc đang chờ phiếu này). */
  taskId?: string | null;
  taskTitle?: string | null;
  /** Bản thứ mấy của việc (1 = lần đầu; tăng sau mỗi lần "Yêu cầu sửa"). */
  version?: number | null;
  previous?: AgentActionPrevious | null;
  /** Còn mấy lần được "Yêu cầu sửa" (0 → khoá nút; null = không giới hạn theo việc). */
  revisionsLeft?: number | null;
}

export type AgentActionScope = 'pending' | 'all';

/** Ghi chú gửi kèm khi duyệt / từ chối: bỏ khoảng trắng thừa, rỗng thì không gửi. */
export function decisionBody(note?: string | null): { note?: string } {
  const trimmed = (note ?? '').trim();
  return trimmed ? { note: trimmed } : {};
}

export async function getAgentActions(scope: AgentActionScope = 'pending', take = 50): Promise<AgentActionView[]> {
  const res = await axios.get<AgentActionView[]>(endpoints.agentActions.list, { params: { status: scope, take } });
  return Array.isArray(res.data) ? res.data : [];
}

export async function getAgentActionPendingCount(): Promise<number> {
  const res = await axios.get<{ count?: number }>(endpoints.agentActions.pendingCount);
  const count = Number(res.data?.count ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export async function getAgentAction(id: string): Promise<AgentActionView> {
  const res = await axios.get<AgentActionView>(endpoints.agentActions.detail(id));
  return res.data;
}

/** Duyệt: máy chủ chạy ngay lệnh đã lưu; phiếu trả về ở trạng thái executed / failed kèm mã + nội dung kết quả. 409 = đã có người xử lý. */
export async function approveAgentAction(id: string, note?: string | null): Promise<AgentActionView> {
  const res = await axios.post<AgentActionView>(endpoints.agentActions.approve(id), decisionBody(note));
  return res.data;
}

export async function rejectAgentAction(id: string, note?: string | null): Promise<AgentActionView> {
  const res = await axios.post<AgentActionView>(endpoints.agentActions.reject(id), decisionBody(note));
  return res.data;
}

/** Body "Yêu cầu sửa": ghi chú bỏ khoảng trắng thừa, ảnh bỏ trùng / rỗng; phần trống thì không gửi. */
export function revisionBody(input: { note?: string | null; imageUrls?: string[] | null }): { note?: string; imageUrls?: string[] } {
  const body: { note?: string; imageUrls?: string[] } = decisionBody(input.note);
  const images = Array.from(new Set((input.imageUrls ?? []).map((u) => u.trim()).filter(Boolean)));
  if (images.length > 0) body.imageUrls = images;
  return body;
}

/**
 * Yêu cầu sửa: lệnh KHÔNG chạy, agent nhận ghi chú (+ ảnh cần làm lại — phải là ảnh của chính phiếu) rồi gửi bản mới.
 * 400 = thiếu ghi chú / ảnh lạ; 409 = quá số lần sửa hoặc phiếu đã được xử lý.
 */
export async function requestAgentActionRevision(
  id: string,
  input: { note?: string | null; imageUrls?: string[] | null },
): Promise<AgentActionView> {
  const res = await axios.post<AgentActionView>(endpoints.agentActions.requestRevision(id), revisionBody(input));
  return res.data;
}

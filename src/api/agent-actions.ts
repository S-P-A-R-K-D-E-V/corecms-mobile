import axios, { endpoints } from './axios';

// ----------------------------------------------------------------------
// Phiếu agent xin làm lệnh ghi (K3 — cổng duyệt lệnh ghi của agent, core-be AgentActionsController). Khoá agent ở mức
// "chờ duyệt" gửi lệnh ghi → máy chủ lưu nguyên lệnh thành phiếu và báo người có quyền agent.approve. Duyệt = máy chủ
// chạy NGAY đúng lệnh đã lưu (người duyệt là người thực hiện) rồi trả phiếu kèm kết quả; từ chối = không chạy.
// ----------------------------------------------------------------------

export type AgentActionStatus = 'pending' | 'approved' | 'executing' | 'executed' | 'failed' | 'rejected' | 'expired';

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

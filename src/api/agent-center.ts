import axios, { endpoints } from './axios';

// ----------------------------------------------------------------------
// Trung tâm Agent (K4 — core-be AgentCenterController, hợp đồng docs/cici/plans/k4-api-contract.md): bảng việc của đội
// agent. App chỉ dùng phần của người có quyền agent.approve: xem tóm tắt, danh sách / chi tiết việc, nhắn chỉ dẫn, dừng /
// chạy lại / huỷ việc. Dữ liệu từ máy chủ được chuẩn hoá nhẹ (mảng thiếu → [], số thiếu → 0) để màn không vỡ khi BE đổi.
// ----------------------------------------------------------------------

export type AgentTaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'waiting_human'
  | 'done'
  | 'failed'
  | 'stopped'
  | 'cancelled';

export type AgentPlanItemStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

export interface AgentPlanItem {
  title: string;
  /** Chuỗi lạ (BE thêm trạng thái mới) vẫn giữ nguyên. */
  status: AgentPlanItemStatus | (string & {});
  note: string | null;
}

export interface AgentTaskView {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  instruction: string;
  /** "manual" | "schedule" | "agent" | "event". */
  source: string;
  sourceRef: string | null;
  parentTaskId: string | null;
  status: AgentTaskStatus | (string & {});
  plan: AgentPlanItem[];
  currentStepIndex: number | null;
  /** Máy chủ dựng sẵn, vd "Bước 3/5 — đang tra tồn kho". */
  currentStepLabel: string | null;
  result: string | null;
  error: string | null;
  /** Phiếu K3 đang chờ duyệt (khi status = waiting_approval). */
  pendingActionId: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  stopRequested: boolean;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
}

export type AgentStepKind = 'model' | 'tool' | 'plan' | 'note' | 'approval' | 'system';

export interface AgentRunStep {
  id: string;
  taskId: string;
  seq: number;
  kind: AgentStepKind | (string & {});
  /** Tên tool (bước tool). */
  name: string | null;
  summary: string;
  /** Tham số / kết quả đã cắt ≤ 4000 ký tự. */
  detail: string | null;
  /** "ok" | "error" | "pending". */
  status: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
  /** Người viết (bước note). */
  authorName: string | null;
}

export interface AgentTaskDetail {
  task: AgentTaskView;
  steps: AgentRunStep[];
}

export interface AgentCenterCounts {
  queued: number;
  running: number;
  waiting_approval: number;
  waiting_human: number;
  done_today: number;
  failed_today: number;
}

export interface AgentCenterSummary {
  paused: boolean;
  runnerEnabled: boolean;
  counts: AgentCenterCounts;
  agents: number;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function normalizePlan(plan: unknown): AgentPlanItem[] {
  if (!Array.isArray(plan)) return [];
  return plan
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({ title: String(p.title ?? ''), status: String(p.status ?? 'pending'), note: str(p.note) }));
}

/** Việc từ máy chủ → dạng màn dùng: plan luôn là mảng, token / số lần gọi tool luôn là số. */
export function normalizeTask(raw: any): AgentTaskView {
  const t = raw ?? {};
  return {
    ...t,
    id: String(t.id ?? ''),
    agentName: String(t.agentName ?? ''),
    title: String(t.title ?? ''),
    instruction: String(t.instruction ?? ''),
    source: String(t.source ?? ''),
    status: String(t.status ?? ''),
    plan: normalizePlan(t.plan),
    currentStepIndex: typeof t.currentStepIndex === 'number' ? t.currentStepIndex : null,
    currentStepLabel: str(t.currentStepLabel),
    result: str(t.result),
    error: str(t.error),
    pendingActionId: str(t.pendingActionId),
    createdByName: str(t.createdByName),
    startedAt: str(t.startedAt),
    finishedAt: str(t.finishedAt),
    stopRequested: t.stopRequested === true,
    inputTokens: num(t.inputTokens),
    outputTokens: num(t.outputTokens),
    toolCalls: num(t.toolCalls),
  } as AgentTaskView;
}

export function normalizeStep(raw: any): AgentRunStep {
  const s = raw ?? {};
  return {
    ...s,
    id: String(s.id ?? ''),
    seq: num(s.seq),
    kind: String(s.kind ?? 'system'),
    name: str(s.name),
    summary: String(s.summary ?? ''),
    detail: str(s.detail),
    status: String(s.status ?? 'ok'),
    durationMs: num(s.durationMs),
    inputTokens: num(s.inputTokens),
    outputTokens: num(s.outputTokens),
    authorName: str(s.authorName),
  } as AgentRunStep;
}

const EMPTY_COUNTS: AgentCenterCounts = {
  queued: 0,
  running: 0,
  waiting_approval: 0,
  waiting_human: 0,
  done_today: 0,
  failed_today: 0,
};

export async function getAgentCenterSummary(): Promise<AgentCenterSummary> {
  const res = await axios.get<any>(endpoints.agentCenter.summary);
  const d = res.data ?? {};
  const c = d.counts ?? {};
  const counts = { ...EMPTY_COUNTS };
  for (const key of Object.keys(EMPTY_COUNTS) as (keyof AgentCenterCounts)[]) counts[key] = num(c[key]);
  return { paused: d.paused === true, runnerEnabled: d.runnerEnabled !== false, counts, agents: num(d.agents) };
}

/** Danh sách việc (mới trước). `statuses` rỗng = máy chủ trả mọi trạng thái của 7 ngày gần nhất + mọi việc chưa xong. */
export async function getAgentTasks(statuses: readonly string[] = [], take = 100): Promise<AgentTaskView[]> {
  const params: Record<string, string | number> = { take };
  if (statuses.length > 0) params.status = statuses.join(',');
  const res = await axios.get<unknown>(endpoints.agentCenter.tasks, { params });
  return Array.isArray(res.data) ? res.data.map(normalizeTask) : [];
}

/** Chi tiết việc + các bước (theo seq tăng dần). */
export async function getAgentTask(id: string): Promise<AgentTaskDetail> {
  const res = await axios.get<any>(endpoints.agentCenter.task(id));
  const steps = Array.isArray(res.data?.steps) ? res.data.steps.map(normalizeStep) : [];
  steps.sort((a: AgentRunStep, b: AgentRunStep) => a.seq - b.seq);
  return { task: normalizeTask(res.data?.task), steps };
}

/** Nội dung chỉ dẫn gửi agent: bỏ khoảng trắng thừa hai đầu. */
export function noteBody(text: string): { text: string } {
  return { text: (text ?? '').trim() };
}

/** Nhắn chỉ dẫn; việc đang "Chờ người" sẽ quay lại hàng chờ để agent đọc rồi chạy tiếp. Trả bước note vừa tạo. */
export async function addAgentTaskNote(id: string, text: string): Promise<AgentRunStep> {
  const res = await axios.post<any>(endpoints.agentCenter.notes(id), noteBody(text));
  return normalizeStep(res.data);
}

/** Dừng: máy chủ đặt stopRequested, runner dừng sau bước hiện tại. 409 = trạng thái không dừng được. */
export async function stopAgentTask(id: string): Promise<AgentTaskView> {
  const res = await axios.post<any>(endpoints.agentCenter.stop(id));
  return normalizeTask(res.data);
}

/** Chạy lại việc lỗi / đã dừng (giữ hội thoại cũ). */
export async function retryAgentTask(id: string): Promise<AgentTaskView> {
  const res = await axios.post<any>(endpoints.agentCenter.retry(id));
  return normalizeTask(res.data);
}

/** Huỷ việc đang chờ chạy. */
export async function cancelAgentTask(id: string): Promise<AgentTaskView> {
  const res = await axios.post<any>(endpoints.agentCenter.cancel(id));
  return normalizeTask(res.data);
}

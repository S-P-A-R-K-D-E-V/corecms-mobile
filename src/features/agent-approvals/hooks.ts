import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  approveAgentAction,
  getAgentAction,
  getAgentActionPendingCount,
  getAgentActions,
  rejectAgentAction,
  requestAgentActionRevision,
  type AgentActionScope,
  type AgentActionView,
} from 'src/api/agent-actions';

// ----------------------------------------------------------------------
// Query / mutation của màn Duyệt việc agent. Khoá gốc 'agent-actions'; số phiếu chờ dùng khoá 'home' để kéo làm mới trang
// chủ cũng nạp lại thẻ "Agent xin duyệt".
// ----------------------------------------------------------------------

export const AGENT_ACTIONS_KEY = ['agent-actions'] as const;
export const AGENT_PENDING_COUNT_KEY = ['home', 'agent-actions-pending'] as const;

export function useAgentActions(scope: AgentActionScope, enabled = true) {
  return useQuery({
    queryKey: [...AGENT_ACTIONS_KEY, 'list', scope],
    queryFn: () => getAgentActions(scope),
    enabled,
    staleTime: 15_000,
  });
}

export function useAgentAction(id: string | undefined) {
  return useQuery({
    queryKey: [...AGENT_ACTIONS_KEY, 'detail', id],
    queryFn: () => getAgentAction(id!),
    enabled: !!id,
    retry: false,
  });
}

/**
 * Số phiếu đang chờ; không có quyền thì không gọi. Lỗi (BE cũ chưa có API → 404, mất mạng) → 0 = ẩn thẻ: không làm hỏng
 * lần kéo làm mới trang chủ (invalidate khoá 'home' với throwOnError).
 */
export function useAgentPendingCount(enabled: boolean) {
  return useQuery({
    queryKey: AGENT_PENDING_COUNT_KEY,
    queryFn: () => getAgentActionPendingCount().catch(() => 0),
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    retry: false,
  });
}

function afterDecision(qc: QueryClient, view: AgentActionView) {
  qc.setQueryData([...AGENT_ACTIONS_KEY, 'detail', view.id], view);
  qc.invalidateQueries({ queryKey: [...AGENT_ACTIONS_KEY, 'list'] });
  qc.invalidateQueries({ queryKey: AGENT_PENDING_COUNT_KEY });
}

export function useApproveAgentAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => approveAgentAction(id, note),
    onSuccess: (view) => afterDecision(qc, view),
  });
}

export function useRejectAgentAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => rejectAgentAction(id, note),
    onSuccess: (view) => afterDecision(qc, view),
  });
}

/** Yêu cầu sửa: lệnh không chạy, agent nhận ghi chú (+ ảnh cần làm lại) rồi gửi bản mới thành phiếu mới. */
export function useRequestAgentActionRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note, imageUrls }: { id: string; note?: string; imageUrls?: string[] }) =>
      requestAgentActionRevision(id, { note, imageUrls }),
    onSuccess: (view) => afterDecision(qc, view),
  });
}

/** Giờ hiện tại, cập nhật mỗi `ms` — để "còn … phút" tự chạy. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

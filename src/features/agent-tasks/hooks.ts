import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  addAgentTaskNote,
  cancelAgentTask,
  getAgentCenterSummary,
  getAgentTask,
  getAgentTasks,
  retryAgentTask,
  stopAgentTask,
  type AgentTaskDetail,
  type AgentTaskView,
} from 'src/api/agent-center';

import { SEGMENT_STATUSES, SUMMARY_REFRESH_MS, detailRefreshMs, listRefreshMs, type TaskSegment } from './agent-task-format';

// ----------------------------------------------------------------------
// Query / mutation của màn Việc của agent. Khoá gốc 'agent-center'; tóm tắt cho thẻ trang chủ dùng khoá 'home' để kéo làm
// mới trang chủ cũng nạp lại thẻ "Agent đang chạy". Tự làm mới chỉ khi màn đang hiện và app ở trước (useScreenActive).
// ----------------------------------------------------------------------

export const AGENT_CENTER_KEY = ['agent-center'] as const;
export const AGENT_CENTER_SUMMARY_KEY = ['home', 'agent-center-summary'] as const;

const detailKey = (id: string | undefined) => [...AGENT_CENTER_KEY, 'task', id] as const;

/** Màn đang được xem (focus) và app đang ở trước — để dừng gọi API định kỳ khi không ai nhìn. */
export function useScreenActive(): boolean {
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setAppActive(next === 'active'));
    return () => sub.remove();
  }, []);

  return focused && appActive;
}

/** Giờ hiện tại, cập nhật mỗi `ms` khi `enabled` — để thời gian chạy của việc đang chạy tự nhảy. */
export function useTicker(enabled: boolean, ms = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [enabled, ms]);
  return now;
}

export function useAgentTasks(segment: TaskSegment, active: boolean) {
  return useQuery({
    queryKey: [...AGENT_CENTER_KEY, 'tasks', segment],
    queryFn: () => getAgentTasks(SEGMENT_STATUSES[segment]),
    staleTime: 3_000,
    refetchInterval: (query) => listRefreshMs(query.state.data, active),
  });
}

export function useAgentTask(id: string | undefined, active: boolean) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getAgentTask(id!),
    enabled: !!id,
    retry: false,
    refetchInterval: (query) => detailRefreshMs(query.state.data?.task.status, active),
  });
}

/**
 * Tóm tắt cho thẻ "Agent đang chạy"; không có quyền thì không gọi. Lỗi (BE chưa có API, mất mạng) → null = ẩn thẻ, không
 * làm hỏng lần kéo làm mới trang chủ (invalidate khoá 'home' với throwOnError).
 */
export function useAgentCenterSummary(enabled: boolean, active: boolean) {
  return useQuery({
    queryKey: AGENT_CENTER_SUMMARY_KEY,
    queryFn: () => getAgentCenterSummary().catch(() => null),
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled && active ? SUMMARY_REFRESH_MS : false,
    retry: false,
  });
}

/** Sau khi dừng / chạy lại / huỷ: ghi việc mới vào chi tiết, nạp lại danh sách + tóm tắt. */
function afterTaskChange(qc: QueryClient, task: AgentTaskView) {
  qc.setQueryData<AgentTaskDetail>(detailKey(task.id), (old) => (old ? { ...old, task } : old));
  qc.invalidateQueries({ queryKey: detailKey(task.id) });
  qc.invalidateQueries({ queryKey: [...AGENT_CENTER_KEY, 'tasks'] });
  qc.invalidateQueries({ queryKey: AGENT_CENTER_SUMMARY_KEY });
}

export function useStopAgentTask() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => stopAgentTask(id), onSuccess: (task) => afterTaskChange(qc, task) });
}

export function useRetryAgentTask() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => retryAgentTask(id), onSuccess: (task) => afterTaskChange(qc, task) });
}

export function useCancelAgentTask() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => cancelAgentTask(id), onSuccess: (task) => afterTaskChange(qc, task) });
}

/** Nhắn chỉ dẫn: thêm bước note vào chi tiết ngay, rồi nạp lại (việc Chờ người chuyển sang Chờ chạy). */
export function useAddAgentTaskNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => addAgentTaskNote(id, text),
    onSuccess: (step, { id }) => {
      qc.setQueryData<AgentTaskDetail>(detailKey(id), (old) =>
        old && !old.steps.some((s) => s.id === step.id) ? { ...old, steps: [...old.steps, step] } : old
      );
      qc.invalidateQueries({ queryKey: detailKey(id) });
      qc.invalidateQueries({ queryKey: [...AGENT_CENTER_KEY, 'tasks'] });
      qc.invalidateQueries({ queryKey: AGENT_CENTER_SUMMARY_KEY });
    },
  });
}

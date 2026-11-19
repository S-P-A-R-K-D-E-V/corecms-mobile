import { useEffect, useMemo, useRef } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import {
  getConversation,
  getConversations,
  getInboxSummary,
  getMessages,
  getQuickReplies,
  type ConversationDetail,
  type ConversationListFilter,
  type ConversationMessage,
  type ConversationPage,
  type ConversationSummary,
  type MessagePage,
} from 'src/api/inbox';

import {
  POLL_MS,
  addMessageToPages,
  patchConversationPages,
  updateMessageInPages,
  upsertConversationPages,
} from './inbox-format';
import { useInboxHubState } from './inbox-hub-state';

// ----------------------------------------------------------------------
// Query của Hộp thư khách. Khoá gốc 'inbox'; tóm tắt cho thẻ trang chủ dùng khoá 'home' (kéo làm mới trang chủ nạp lại).
// Hub /hubs/inbox đang nối → không hỏi định kỳ; hub hỏng → hỏi lại mỗi POLL_MS khi màn đang hiện.
// ----------------------------------------------------------------------

export const INBOX_KEY = ['inbox'] as const;
export const INBOX_SUMMARY_KEY = [...INBOX_KEY, 'summary'] as const;
export const INBOX_HOME_SUMMARY_KEY = ['home', 'inbox-summary'] as const;
export const listKey = (filter: ConversationListFilter) => [...INBOX_KEY, 'list', filter] as const;
export const detailKey = (id: string | undefined) => [...INBOX_KEY, 'detail', id] as const;
export const messagesKey = (id: string | undefined) => [...INBOX_KEY, 'messages', id] as const;

type ListData = InfiniteData<ConversationPage, string | null>;
type MessagesData = InfiniteData<MessagePage, string | null>;

function usePollInterval(active: boolean): number | false {
  const connected = useInboxHubState((s) => s.joined);
  return active && !connected ? POLL_MS : false;
}

export function useInboxSummary(enabled: boolean, active: boolean) {
  const poll = usePollInterval(active);
  return useQuery({
    queryKey: INBOX_SUMMARY_KEY,
    queryFn: () => getInboxSummary(),
    enabled,
    staleTime: 5_000,
    refetchInterval: poll,
  });
}

/** Tóm tắt cho thẻ trang chủ; lỗi (cửa hàng chưa bật bán online, mất mạng) → null = ẩn thẻ. */
export function useInboxHomeSummary(enabled: boolean, active: boolean) {
  return useQuery({
    queryKey: INBOX_HOME_SUMMARY_KEY,
    queryFn: () => getInboxSummary().catch(() => null),
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled && active ? 60_000 : false,
    retry: false,
  });
}

/**
 * Danh sách theo bộ lọc, cuộn tải thêm bằng `nextBefore`. Máy chủ cũ (chưa F5) bỏ qua `kind` / `unread` → lọc lại ở máy cho
 * đúng tab.
 */
export function useConversationList(filter: ConversationListFilter, enabled: boolean, active: boolean) {
  const poll = usePollInterval(active);
  const query = useInfiniteQuery({
    queryKey: listKey(filter),
    queryFn: ({ pageParam }) => getConversations(filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled,
    staleTime: 5_000,
    refetchInterval: poll,
  });
  const items = useMemo(() => {
    const all = query.data?.pages.flatMap((p) => p.items) ?? [];
    const seen = new Set<string>();
    return all.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      if (filter.kind && c.kind !== filter.kind) return false;
      return true;
    });
  }, [query.data, filter.kind]);
  return { ...query, items };
}

export function useConversationDetail(id: string | undefined, active: boolean) {
  const poll = usePollInterval(active);
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getConversation(id!),
    enabled: !!id,
    retry: false,
    refetchInterval: poll,
  });
}

export function useConversationMessages(id: string | undefined, active: boolean) {
  const poll = usePollInterval(active);
  return useInfiniteQuery({
    queryKey: messagesKey(id),
    queryFn: ({ pageParam }) => getMessages(id!, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!id,
    retry: false,
    refetchInterval: poll,
  });
}

export function useQuickReplies(enabled: boolean) {
  return useQuery({
    queryKey: [...INBOX_KEY, 'quick-replies'],
    queryFn: () => getQuickReplies(),
    enabled,
    staleTime: 5 * 60_000,
  });
}

// ----------------------------------------------------------------------
// Ghi vào bộ đệm (dùng chung cho sự kiện hub và kết quả thao tác).

/** Một hội thoại vừa đổi: gộp vào mọi danh sách đang có (theo bộ lọc của từng danh sách) + chi tiết; nạp lại số đếm. */
export function applyConversation(qc: QueryClient, conv: ConversationSummary, myUserId: string | null | undefined) {
  for (const [key, data] of qc.getQueriesData<ListData>({ queryKey: [...INBOX_KEY, 'list'] })) {
    const filter = key[2] as ConversationListFilter | undefined;
    if (!data || !filter) continue;
    const pages = upsertConversationPages(data.pages, conv, filter, myUserId);
    if (pages !== data.pages) qc.setQueryData<ListData>(key, { ...data, pages: pages ?? data.pages });
  }
  qc.setQueryData<ConversationDetail>(detailKey(conv.id), (old) => (old ? { ...old, ...conv } : old));
  invalidateCounts(qc);
}

export function invalidateCounts(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: INBOX_SUMMARY_KEY });
  qc.invalidateQueries({ queryKey: INBOX_HOME_SUMMARY_KEY });
}

/** Sửa tại chỗ trong mọi danh sách (không xếp lại) — vd đã đọc. */
export function patchConversation(qc: QueryClient, id: string, patch: Partial<ConversationSummary>) {
  for (const [key, data] of qc.getQueriesData<ListData>({ queryKey: [...INBOX_KEY, 'list'] })) {
    if (!data) continue;
    qc.setQueryData<ListData>(key, { ...data, pages: patchConversationPages(data.pages, id, patch) ?? data.pages });
  }
  qc.setQueryData<ConversationDetail>(detailKey(id), (old) => (old ? { ...old, ...patch } : old));
}

export function applyMessage(qc: QueryClient, message: ConversationMessage, mode: 'add' | 'update') {
  qc.setQueryData<MessagesData>(messagesKey(message.conversationId), (old) => {
    if (!old) return old;
    const pages = mode === 'add' ? addMessageToPages(old.pages, message) : updateMessageInPages(old.pages, message);
    return pages === old.pages || !pages ? old : { ...old, pages };
  });
}

// ----------------------------------------------------------------------
// Thao tác trả về ConversationSummary (Tôi trả lời / trả về / nhãn / trạng thái) → gộp vào bộ đệm.

export function useConversationMutation<TVars>(
  fn: (vars: TVars) => Promise<ConversationSummary>,
  myUserId: string | null | undefined
) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (conv) => applyConversation(qc, conv, myUserId) });
}

/** Khi màn đang hiện mà dữ liệu bị đổi ngoài màn (hub nối lại sau khi mất) → nạp lại một lần. */
export function useRefetchOnReconnect(refetch: () => unknown) {
  const joinedAt = useInboxHubState((s) => s.joinedAt);
  const first = useRef(joinedAt);
  useEffect(() => {
    if (joinedAt && joinedAt !== first.current) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedAt]);
}

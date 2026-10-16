import { QueryClient } from '@tanstack/react-query';

/**
 * Lỗi 4xx (403 thiếu quyền, 404, 400…) gọi lại vẫn y nguyên — chỉ thử lại một lần cho lỗi mạng / 5xx và lỗi tạm thời
 * 408/429. axios reject bằng body kèm `status` (src/api/axios.ts toApiError); HttpStatusError cũng có `status`.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  const permanent = typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
  return !permanent && failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

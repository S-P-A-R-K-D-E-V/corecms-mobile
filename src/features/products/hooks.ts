import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { getProduct, getProducts, getStockAdjustments } from 'src/api/erp';
import type { IStockAdjustment } from 'src/types/erp';

import { POLL_INTERVAL_MS, newlyApplied, settleAwaited, shouldPoll, sortRecent } from './stock-adjust';

const PAGE = 30;

/**
 * Danh sách hàng đang kinh doanh, tìm theo tên/mã/mã vạch (cả biến thể), tải thêm khi cuộn. `categoryId`:
 * chỉ hàng thuộc đúng nhóm đó (core-be lọc).
 */
export function useProductSearch(keyword: string, categoryId?: string | null) {
  return useInfiniteQuery({
    queryKey: ['erp', 'products', keyword, categoryId ?? null],
    queryFn: ({ pageParam }) => getProducts({ keyword, categoryId: categoryId ?? undefined, page: pageParam, pageSize: PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.length * PAGE < last.totalCount ? pages.length + 1 : undefined),
    staleTime: 60_000,
  });
}

export function useProduct(id?: string) {
  return useQuery({
    queryKey: ['erp', 'product', id],
    queryFn: () => getProduct(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

// ── Chỉnh tồn kho ───────────────────────────────────────────────────────

export const stockAdjustmentsKey = (productId: string) => ['erp', 'stock-adjustments', productId] as const;

/** Tồn vừa đổi: tải lại chi tiết hàng + danh sách hàng (màn Hàng hoá, Bán hàng). */
export function invalidateProductStock(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['erp', 'product'] });
  qc.invalidateQueries({ queryKey: ['erp', 'products'] });
}

// Lúc vừa gửi / thử lại theo từng hàng: lần chỉnh tạo đã lâu nhưng vừa "Thử lại" vẫn được hỏi lại trạng thái.
const pollKicks = new Map<string, number>();
// Lần chỉnh máy này vừa gửi / thử lại, còn chờ KiotViet: thấy đã nhận thì tải lại tồn (kể cả không kịp thấy bước chờ).
const awaiting = new Set<string>();

/**
 * Gọi sau khi gửi / thử lại để danh sách của hàng này hỏi lại trạng thái đẩy KiotViet. `adjustmentId`: lần chỉnh
 * còn chờ đẩy (Pending — không truyền khi đã Local) → khi KiotViet nhận thì tải lại tồn hàng hoá.
 */
export function kickStockAdjustmentPolling(qc: QueryClient, productId: string, adjustmentId?: string) {
  pollKicks.set(productId, Date.now());
  if (adjustmentId) awaiting.add(adjustmentId);
  qc.invalidateQueries({ queryKey: stockAdjustmentsKey(productId) });
}

/** Hàng này vừa được sửa tồn / thử lại trên máy (phiên app này) → lịch sử của nó mở sẵn, tiếp tục hỏi trạng thái. */
export const wasStockAdjusted = (productId: string) => pollKicks.has(productId);

/**
 * Tuỳ chọn query danh sách chỉnh tồn của 1 hàng (dùng chung cho useQuery / useQueries): mới nhất lên đầu;
 * còn lần chờ đẩy thì hỏi lại mỗi 3 giây (tối đa 10 phút); lần nào vừa xong thì tải lại tồn của hàng hoá.
 */
export function stockAdjustmentsQuery(qc: QueryClient, productId: string, enabled = true) {
  return {
    queryKey: stockAdjustmentsKey(productId),
    queryFn: async (): Promise<IStockAdjustment[]> => {
      const prev = qc.getQueryData<IStockAdjustment[]>(stockAdjustmentsKey(productId));
      const next = sortRecent(await getStockAdjustments(productId));
      // Gọi cả hai (không || tắt) để danh sách chờ luôn được dọn.
      const mine = settleAwaited(awaiting, next);
      if (newlyApplied(prev, next) || mine) invalidateProductStock(qc);
      return next;
    },
    enabled: !!productId && enabled,
    staleTime: 30_000,
    refetchInterval: (query: { state: { data?: IStockAdjustment[] } }) =>
      shouldPoll(query.state.data, Date.now(), pollKicks.get(productId)) ? POLL_INTERVAL_MS : false,
  };
}

export function useStockAdjustments(productId: string | undefined, enabled = true) {
  const qc = useQueryClient();
  return useQuery(stockAdjustmentsQuery(qc, productId ?? '', enabled));
}

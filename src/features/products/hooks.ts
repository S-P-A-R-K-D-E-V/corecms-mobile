import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { getProduct, getProducts } from 'src/api/erp';

const PAGE = 30;

/** Danh sách hàng đang kinh doanh, tìm theo tên/mã/mã vạch (cả biến thể), tải thêm khi cuộn. */
export function useProductSearch(keyword: string) {
  return useInfiniteQuery({
    queryKey: ['erp', 'products', keyword],
    queryFn: ({ pageParam }) => getProducts({ keyword, page: pageParam, pageSize: PAGE }),
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

import axios, { endpoints } from './axios';
import type { ILateCoverRequest, IReviewLateCoverRequestDto } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Làm hộ ca (đi muộn) — phần dành cho Manager duyệt. Đồng bộ core-fe lateCover.ts.
// ----------------------------------------------------------------------

/** [Manager] Danh sách yêu cầu làm hộ đang chờ duyệt. */
export async function getPendingLateCoverRequests(): Promise<ILateCoverRequest[]> {
  const response = await axios.get<ILateCoverRequest[]>(endpoints.lateCover.pending);
  return response.data;
}

/** [Manager] Duyệt / từ chối yêu cầu làm hộ. */
export async function reviewLateCoverRequest(
  id: string,
  data: IReviewLateCoverRequestDto
): Promise<void> {
  await axios.put(endpoints.lateCover.review(id), data);
}

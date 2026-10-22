import axios, { endpoints } from './axios';
import { putFileToPresignedUrl } from 'src/services/upload/presigned-put';
import type {
  IEnrollQualityRequest,
  IEnrollQualityResponse,
  IEnrollPresignRequest,
  IEnrollPresignedFileResponse,
  IEnrollFaceBatchRequest,
  IFaceEmbeddingResponse,
  IFaceEnrollmentRequest,
  IVerifySelfRequest,
  IVerifySelfResponse,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------

/** Validate 1 ảnh chụp trong luồng đăng ký khuôn mặt có hướng dẫn tư thế — gọi ngay sau mỗi
 *  lần chụp để biết đủ góc/đã chớp mắt chưa trước khi coi tấm ảnh hợp lệ. */
export async function checkEnrollQuality(imageBase64: string): Promise<IEnrollQualityResponse> {
  const response = await axios.post<IEnrollQualityResponse>(endpoints.faceTracking.enrollQuality, {
    imageBase64,
  } satisfies IEnrollQualityRequest);
  return response.data;
}

/** Gửi toàn bộ ảnh đã qua validate để đăng ký/cập nhật khuôn mặt — PUT thẳng từng ảnh (từ file
 *  cache local do camera chụp) lên R2 qua presigned URL (không đi qua API/nginx, tránh 413 khi
 *  gộp nhiều ảnh base64 vào 1 request), rồi chỉ gửi object key cho BE tự tải về + tính embedding.
 *  Tải LẦN LƯỢT từng ảnh (thử lại khi mạng chập chờn, có giới hạn thời gian) — trước đây 5 ảnh tải cùng lúc bằng
 *  fetch, mạng 4G yếu là treo rồi báo "Network request failed". `onProgress(đã xong, tổng)` để hiện tiến độ. */
export async function submitFaceEnrollment(
  photos: { uri: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<IFaceEmbeddingResponse> {
  const presignRes = await axios.post<IEnrollPresignedFileResponse[]>(endpoints.faceTracking.enrollPresign, {
    count: photos.length,
  } satisfies IEnrollPresignRequest);
  const presigned = presignRes.data;

  for (let i = 0; i < presigned.length; i++) {
    onProgress?.(i, presigned.length);
    await putFileToPresignedUrl(presigned[i].uploadUrl, photos[i].uri);
  }
  onProgress?.(presigned.length, presigned.length);

  const response = await axios.post<IFaceEmbeddingResponse>(endpoints.faceTracking.enrollBatch, {
    objectKeys: presigned.map((p) => p.objectKey),
  } satisfies IEnrollFaceBatchRequest);
  return response.data;
}

// ── Duyệt đăng ký khuôn mặt (quyền user.update) ──

/** Đăng ký khuôn mặt đang chờ duyệt, cũ nhất trước — ảnh mới cạnh ảnh đang dùng + % giống. */
export async function getFaceEnrollmentRequests(): Promise<IFaceEnrollmentRequest[]> {
  const response = await axios.get<IFaceEnrollmentRequest[]>(endpoints.faceTracking.enrollmentRequests);
  return response.data;
}

export async function approveFaceEnrollmentRequest(id: string): Promise<void> {
  await axios.post(endpoints.faceTracking.approveEnrollment(id));
}

export async function rejectFaceEnrollmentRequest(id: string, reason?: string): Promise<void> {
  await axios.post(endpoints.faceTracking.rejectEnrollment(id), { reason: reason || null });
}

/** Tự kiểm tra khuôn mặt hiện tại (video ngắn) có khớp với embedding đã đăng ký không —
 *  không tạo attendance log, chỉ để nhân viên tự chẩn đoán trước khi ra quầy chấm công. */
export async function verifySelfFace(videoBase64: string): Promise<IVerifySelfResponse> {
  const response = await axios.post<IVerifySelfResponse>(endpoints.faceTracking.verifySelf, {
    videoBase64,
  } satisfies IVerifySelfRequest);
  return response.data;
}

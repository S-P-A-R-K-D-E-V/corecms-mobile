import axios, { endpoints } from './axios';
import type {
  IEnrollQualityRequest,
  IEnrollQualityResponse,
  IEnrollPresignRequest,
  IEnrollPresignedFileResponse,
  IEnrollFaceBatchRequest,
  IFaceEmbeddingResponse,
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

async function uploadToPresignedUrl(uploadUrl: string, fileUri: string): Promise<void> {
  const fileResponse = await fetch(fileUri);
  const blob = await fileResponse.blob();
  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  if (!putResponse.ok) {
    throw new Error(`Tải ảnh lên thất bại (${putResponse.status})`);
  }
}

/** Gửi toàn bộ ảnh đã qua validate để đăng ký/cập nhật khuôn mặt — PUT thẳng từng ảnh (từ file
 *  cache local do camera chụp) lên R2 qua presigned URL (không đi qua API/nginx, tránh 413 khi
 *  gộp nhiều ảnh base64 vào 1 request), rồi chỉ gửi object key cho BE tự tải về + tính embedding.
 *  Cùng pattern với src/api/cleaning.ts (completeCleaningTask). */
export async function submitFaceEnrollment(photos: { uri: string }[]): Promise<IFaceEmbeddingResponse> {
  const presignRes = await axios.post<IEnrollPresignedFileResponse[]>(endpoints.faceTracking.enrollPresign, {
    count: photos.length,
  } satisfies IEnrollPresignRequest);
  const presigned = presignRes.data;

  await Promise.all(presigned.map((p, i) => uploadToPresignedUrl(p.uploadUrl, photos[i].uri)));

  const response = await axios.post<IFaceEmbeddingResponse>(endpoints.faceTracking.enrollBatch, {
    objectKeys: presigned.map((p) => p.objectKey),
  } satisfies IEnrollFaceBatchRequest);
  return response.data;
}

/** Tự kiểm tra khuôn mặt hiện tại (video ngắn) có khớp với embedding đã đăng ký không —
 *  không tạo attendance log, chỉ để nhân viên tự chẩn đoán trước khi ra quầy chấm công. */
export async function verifySelfFace(videoBase64: string): Promise<IVerifySelfResponse> {
  const response = await axios.post<IVerifySelfResponse>(endpoints.faceTracking.verifySelf, {
    videoBase64,
  } satisfies IVerifySelfRequest);
  return response.data;
}

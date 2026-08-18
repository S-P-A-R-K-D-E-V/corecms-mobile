import axios, { endpoints } from './axios';
import type {
  IEnrollQualityRequest,
  IEnrollQualityResponse,
  IEnrollFaceBatchRequest,
  IFaceEmbeddingResponse,
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

/** Gửi toàn bộ ảnh đã qua validate (đủ 6 bước) để đăng ký/cập nhật khuôn mặt. */
export async function submitFaceEnrollment(imagesBase64: string[]): Promise<IFaceEmbeddingResponse> {
  const response = await axios.post<IFaceEmbeddingResponse>(endpoints.faceTracking.enrollBatch, {
    imagesBase64,
  } satisfies IEnrollFaceBatchRequest);
  return response.data;
}

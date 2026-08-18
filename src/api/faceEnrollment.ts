import axios, { endpoints } from './axios';
import type {
  IEnrollQualityRequest,
  IEnrollQualityResponse,
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

/** Gửi toàn bộ ảnh đã qua validate (đủ 6 bước) để đăng ký/cập nhật khuôn mặt. */
export async function submitFaceEnrollment(imagesBase64: string[]): Promise<IFaceEmbeddingResponse> {
  const response = await axios.post<IFaceEmbeddingResponse>(endpoints.faceTracking.enrollBatch, {
    imagesBase64,
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

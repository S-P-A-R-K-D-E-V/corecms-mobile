import axios, { endpoints } from './axios';
import { putToPresignedUrl, readLocalFile, type PresignedTarget } from './presigned-upload';

// ----------------------------------------------------------------------
// Ảnh sản phẩm (core-be ProductImagesController, /products/{id}/images) — dùng chung lõi AI với Studio ảnh bán online:
// bộ ảnh có thứ tự (ảnh đầu = ảnh chính) + mô tả bán online, AI phân tích + tạo ảnh, ghép nền giữ nguyên.
// Ảnh chụp / chọn: xin presigned URL rồi PUT thẳng lên R2 (luật app: không gửi ảnh qua API).
// ----------------------------------------------------------------------

export type ProductImages = {
  productId: string;
  code: string;
  name: string;
  kiotVietLinked: boolean;
  imagesCustomized: boolean;
  images: string[];
  description: string | null;
  onlineDescription: string | null;
};

export type ImagePreset = { id: string; label: string; group: 'studio' | 'lifestyle'; hint: string };
export type ImageTag = { id: string; label: string };
export type ImageAnalysis = {
  category: string;
  kind: string;
  sensitive: boolean;
  summary: string | null;
  presets: ImagePreset[];
  tags: ImageTag[];
  fallback: boolean;
};
export type ImageBackground = { id: string; label: string; color: string };
export type ImageCatalog = { items: ImagePreset[]; tags: ImageTag[]; backgrounds: ImageBackground[]; maxNoteLength: number };
/** style "frame" = giữ nguyên ảnh gốc đặt lên nền màu (không qua AI). */
export type ImageResult = { url: string; sourceUrl: string; style: string; label: string };

const root = (id: string) => endpoints.products.images(id);

export async function getProductImages(id: string) {
  return (await axios.get<ProductImages>(root(id))).data;
}

export async function getProductImageCatalog(id: string) {
  return (await axios.get<ImageCatalog>(`${root(id)}/ai/styles`)).data;
}

export async function saveProductImages(id: string, input: { urls?: string[]; onlineDescription?: string }) {
  return (await axios.put<ProductImages>(root(id), input)).data;
}

/** Ảnh đã chuẩn bị (vẽ lại bỏ EXIF/GPS, JPEG) → presigned URL → PUT lên R2. Trả URL công khai (chưa gắn vào sản phẩm). */
export async function uploadProductImage(id: string, file: { uri: string; name: string; contentType: string }) {
  const { data } = await axios.post<{ objectKey: string; uploadUrl: string; publicUrl: string }>(`${root(id)}/presign`, {
    fileName: file.name,
    contentType: file.contentType,
  });
  const target: PresignedTarget = { objectKey: data.objectKey, uploadUrl: data.uploadUrl };
  await putToPresignedUrl(target, await readLocalFile(file.uri), file.contentType);
  return data.publicUrl;
}

export async function analyzeProductImage(id: string, sourceUrl: string) {
  return (await axios.post<ImageAnalysis>(`${root(id)}/ai/analyze`, { sourceUrl }, { timeout: 120_000 })).data;
}

/** Một lần gọi = một ảnh (10–60 giây). */
export async function generateProductImage(id: string, input: { sourceUrl: string; preset: string; tags?: string[]; note?: string }) {
  return (await axios.post<ImageResult>(`${root(id)}/ai/generate`, input, { timeout: 180_000 })).data;
}

export async function frameProductImage(id: string, input: { sourceUrl: string; background: string; aspect: 'square' | 'portrait' }) {
  return (await axios.post<ImageResult>(`${root(id)}/frame`, input, { timeout: 60_000 })).data;
}

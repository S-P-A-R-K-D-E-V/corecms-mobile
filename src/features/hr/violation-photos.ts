import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { toast } from 'src/components/overlay';
import { imagePickerQuality, pickedImage, prepareAttachment } from 'src/features/chat/attachment-prepare';
import type { ViolationPhotoSource } from 'src/api/hr';

// ----------------------------------------------------------------------
// Ảnh minh chứng vi phạm: chụp bằng camera sau hoặc chọn nhiều ảnh từ thư viện. Vẽ lại như ảnh chat (bỏ EXIF/GPS, JPEG, cạnh
// dài ≤ 2048px) rồi chép vào documentDirectory (thư mục cache của camera có thể bị dọn trước khi tải xong). Tải lên xong / bỏ
// bản ghi thì xoá bản trên máy.
// ----------------------------------------------------------------------

const DIR = `${FileSystem.documentDirectory ?? ''}violations/`;
/** Server chỉ nhận JPEG / PNG / WebP (core-be ViolationPhotoRules.ContentTypes). */
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type LocalViolationPhoto = { uri: string; type: string; source: ViolationPhotoSource };

async function keep(uri: string, type: string, source: ViolationPhotoSource): Promise<LocalViolationPhoto> {
  if (!FileSystem.documentDirectory) return { uri, type, source };
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const to = `${DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to });
    return { uri: to, type, source };
  } catch {
    return { uri, type, source };
  }
}

async function prepare(asset: ImagePicker.ImagePickerAsset, source: ViolationPhotoSource): Promise<LocalViolationPhoto | null> {
  try {
    const prepared = await prepareAttachment(pickedImage(asset));
    if (!ACCEPTED.has(prepared.contentType)) return null;
    return await keep(prepared.uri, prepared.contentType, source);
  } catch {
    return null;
  }
}

/** Chụp một ảnh bằng camera sau. Huỷ / thiếu quyền / ảnh hỏng → null (đã báo). */
export async function captureViolationPhoto(): Promise<LocalViolationPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    toast.error('Vui lòng cấp quyền camera để chụp ảnh minh chứng.', 'Cần cấp quyền');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    quality: imagePickerQuality(0.7),
    exif: false,
    cameraType: ImagePicker.CameraType.back,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const photo = await prepare(result.assets[0], 'Camera');
  if (!photo) toast.error('Không đọc được ảnh vừa chụp. Vui lòng chụp lại.');
  return photo;
}

/** Chọn tối đa `limit` ảnh từ thư viện; ảnh không đọc được / sai định dạng thì bỏ và báo. */
export async function pickViolationPhotos(limit: number): Promise<LocalViolationPhoto[]> {
  if (limit <= 0) return [];
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    toast.error('Vui lòng cấp quyền thư viện ảnh để chọn ảnh minh chứng.', 'Cần cấp quyền');
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: imagePickerQuality(0.7),
    exif: false,
  });
  if (result.canceled) return [];
  const prepared = await Promise.all(result.assets.slice(0, limit).map((a) => prepare(a, 'Library')));
  const ok = prepared.filter((p): p is LocalViolationPhoto => !!p);
  if (ok.length < prepared.length) toast.error('Có ảnh không đọc được hoặc không phải JPG / PNG / WEBP — đã bỏ qua.');
  return ok;
}

/** Xoá bản trên máy (ảnh ngoài thư mục của app thì để yên). */
export async function discardViolationPhoto(uri: string): Promise<void> {
  if (!DIR || !uri.startsWith(DIR)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

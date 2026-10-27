import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { toast } from 'src/components/overlay';
import { imagePickerQuality, pickedImage, prepareAttachment } from 'src/features/chat/attachment-prepare';
import type { DraftPhoto } from './inspection-draft';

// ----------------------------------------------------------------------
// Ảnh kiểm tra: chụp bằng camera sau (không lấy thư viện — ảnh phải chụp tại chỗ), vẽ lại như ảnh chat (bỏ EXIF/GPS,
// JPEG, cạnh dài ≤ 2048px), rồi chép vào documentDirectory: thư mục cache của camera có thể bị hệ điều hành dọn
// trước khi kịp tải lên. Tải lên xong / bỏ bản nháp thì xoá.
// ----------------------------------------------------------------------

const DIR = `${FileSystem.documentDirectory ?? ''}inspection/`;
/** Server chỉ nhận JPEG / PNG / WebP (core-be InspectionsController.PhotoTypes). */
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function keep(inspectionId: string, uri: string, type: string): Promise<DraftPhoto> {
  if (!FileSystem.documentDirectory) return { uri, type };
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const to = `${DIR}${inspectionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to });
    return { uri: to, type };
  } catch {
    return { uri, type };
  }
}

/** Chụp một ảnh lỗi / ảnh sau khi sửa. Huỷ, thiếu quyền, ảnh không gửi được → null (đã báo). */
export async function captureInspectionPhoto(inspectionId: string): Promise<DraftPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    toast.error('Vui lòng cấp quyền camera để chụp ảnh kiểm tra.', 'Cần cấp quyền');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    quality: imagePickerQuality(0.7),
    exif: false,
    cameraType: ImagePicker.CameraType.back,
  });
  if (result.canceled || result.assets.length === 0) return null;
  try {
    const prepared = await prepareAttachment(pickedImage(result.assets[0]));
    if (!ACCEPTED.has(prepared.contentType)) {
      toast.error('Ảnh này không gửi được — chỉ nhận JPG, PNG, WEBP. Hãy cập nhật app hoặc chụp lại.');
      return null;
    }
    return keep(inspectionId, prepared.uri, prepared.contentType);
  } catch {
    toast.error('Không đọc được ảnh vừa chụp. Vui lòng chụp lại.');
    return null;
  }
}

/** Xoá một ảnh đã chép vào thư mục của app (ảnh ngoài thư mục thì để yên). */
export async function discardInspectionPhoto(uri: string): Promise<void> {
  if (!DIR || !uri.startsWith(DIR)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/** Xoá mọi ảnh trên máy của một lượt kiểm (đã lưu lên server / bỏ bản nháp). */
export async function discardInspectionPhotos(inspectionId: string): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  try {
    const names = await FileSystem.readDirectoryAsync(DIR);
    await Promise.all(
      names
        .filter((n) => n.startsWith(`${inspectionId}-`))
        .map((n) => FileSystem.deleteAsync(`${DIR}${n}`, { idempotent: true }).catch(() => {}))
    );
  } catch {
    // Chưa có thư mục → không có gì để xoá.
  }
}

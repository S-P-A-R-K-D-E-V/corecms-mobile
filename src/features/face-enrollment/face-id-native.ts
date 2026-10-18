import { TurboModuleRegistry } from 'react-native';

type VisionCameraModule = typeof import('react-native-vision-camera');
type FaceDetectorModule = typeof import('react-native-vision-camera-face-detector');

export type FaceIdNative = { vc: VisionCameraModule; fd: FaceDetectorModule };

let cached: FaceIdNative | null | undefined;

/**
 * Module native nhận diện khuôn mặt trên máy (VisionCamera + ML Kit) chỉ có từ bản build Spark Store 1.0.4. Bản cũ vẫn
 * nhận JS mới qua OTA nên KHÔNG import thẳng (import sẽ văng lỗi ngay khi mở app) — nạp lười ở đây, thiếu thì null để
 * màn đăng ký dùng cách cũ (chụp nền ~1 giây/lần, máy chủ chấm từng bước).
 */
export function loadFaceIdNative(): FaceIdNative | null {
  if (cached !== undefined) return cached;
  try {
    if (!TurboModuleRegistry.get('NitroModules')) {
      cached = null;
      return cached;
    }
    cached = {
      vc: require('react-native-vision-camera') as VisionCameraModule,
      fd: require('react-native-vision-camera-face-detector') as FaceDetectorModule,
    };
  } catch {
    cached = null;
  }
  return cached;
}

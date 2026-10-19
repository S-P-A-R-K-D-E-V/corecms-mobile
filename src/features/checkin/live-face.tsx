import { useCallback, useEffect, useState, type RefObject } from 'react';
import { View } from 'react-native';
import type { CameraView } from 'expo-camera';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from 'src/components/ui';
import { getImageManipulator } from 'src/features/chat/attachment-prepare';

import { orientedFrameSize, pickPictureSize, type Size } from './face-stream';

// ----------------------------------------------------------------------
// Phần dùng chung của màn quét khuôn mặt trực tiếp (chấm công + kiểm tra so khớp): chụp khung hình nhẹ từ camera
// trước để gửi qua /hubs/self-verify, và khung bám khuôn mặt trượt mượt theo kết quả máy chủ.
// ----------------------------------------------------------------------

/** Khung hình lớn hơn thế này (máy bỏ qua cỡ ảnh nhỏ đã chọn, vd iPhone) → thu nhỏ còn cạnh dài 640 px trước khi gửi. */
const MAX_FRAME_CHARS = 160_000;
const SHRINK_LONG_SIDE = 640;

/**
 * Thu nhỏ khung hình còn cạnh dài 640 px, JPEG 0.6 (≈40–60 KB). Bộ nén xoay ảnh theo EXIF nên width / height trả về đã
 * đúng chiều. Bản app chưa có bộ nén → null (gửi ảnh gốc, máy chủ vẫn nhận tới 5 MB).
 */
async function shrinkFrame(uri: string): Promise<{ base64: string; width: number; height: number } | null> {
  const M = getImageManipulator();
  if (!M) return null;
  const owned: { release(): void }[] = [];
  try {
    const ctx = M.ImageManipulator.manipulate(uri);
    owned.push(ctx);
    const original = await ctx.renderAsync();
    owned.push(original);
    const scale = Math.min(1, SHRINK_LONG_SIDE / Math.max(original.width, original.height));
    const resized = M.ImageManipulator.manipulate(original).resize({
      width: Math.round(original.width * scale),
      height: Math.round(original.height * scale),
    });
    owned.push(resized);
    const out = await resized.renderAsync();
    owned.push(out);
    const saved = await out.saveAsync({ compress: 0.6, format: M.SaveFormat.JPEG, base64: true });
    return saved.base64 ? { base64: saved.base64, width: out.width, height: out.height } : null;
  } catch {
    return null;
  } finally {
    for (const o of owned) {
      try {
        o.release();
      } catch {}
    }
  }
}

/**
 * Chụp khung hình gửi máy chủ: chọn cỡ ảnh 4:3 nhỏ nhất ≥ 640 px khi camera sẵn sàng, chụp không xử lý (nhanh, không
 * tiếng), quá nặng thì thu nhỏ. `frame` = kích thước ảnh đúng chiều — để đổi toạ độ khuôn mặt sang khung xem trước.
 */
export function useFrameCapture(cameraRef: RefObject<CameraView | null>, portrait: boolean) {
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [frame, setFrame] = useState<Size | null>(null);

  const pickSize = useCallback(async () => {
    try {
      const sizes = (await cameraRef.current?.getAvailablePictureSizesAsync()) ?? [];
      const picked = pickPictureSize(sizes);
      if (picked) setPictureSize(picked);
    } catch {
      // Không lấy được danh sách cỡ ảnh → dùng mặc định (ảnh nặng hơn, vẫn chạy).
    }
  }, [cameraRef]);

  const capture = useCallback(async (): Promise<string | null> => {
    const photo = await cameraRef.current?.takePictureAsync({
      quality: 0.5,
      base64: true,
      skipProcessing: true,
      shutterSound: false,
    });
    if (!photo?.base64) return null;
    if (photo.base64.length > MAX_FRAME_CHARS) {
      const shrunk = await shrinkFrame(photo.uri);
      if (shrunk) {
        setFrame({ width: shrunk.width, height: shrunk.height });
        return shrunk.base64;
      }
    }
    const fromPicture = pictureSize ? /^(\d+)x(\d+)$/.exec(pictureSize) : null;
    const rawW = photo.width > 0 ? photo.width : fromPicture ? Number(fromPicture[1]) : 480;
    const rawH = photo.height > 0 ? photo.height : fromPicture ? Number(fromPicture[2]) : 640;
    setFrame(orientedFrameSize(rawW, rawH, portrait));
    return photo.base64;
  }, [cameraRef, pictureSize, portrait]);

  const reset = useCallback(() => setFrame(null), []);

  return { pictureSize, frame, pickSize, capture, reset };
}

/** Khung bám khuôn mặt — trượt mượt giữa các lần cập nhật (~4 lần/giây) như kiosk. */
export function FaceBox({
  left,
  top,
  width,
  height,
  color,
  label,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  label: string;
}) {
  const x = useSharedValue(left);
  const y = useSharedValue(top);
  const w = useSharedValue(width);
  const h = useSharedValue(height);
  useEffect(() => {
    const t = { duration: 120 };
    x.value = withTiming(left, t);
    y.value = withTiming(top, t);
    w.value = withTiming(width, t);
    h.value = withTiming(height, t);
  }, [left, top, width, height, x, y, w, h]);
  const style = useAnimatedStyle(() => ({ left: x.value, top: y.value, width: w.value, height: h.value }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderWidth: 3, borderRadius: 18, borderColor: color }, style]}>
      <View style={{ position: 'absolute', top: -30, left: -3, backgroundColor: color, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
        <Text className="text-white font-bold text-[12px]" numberOfLines={1}>{label}</Text>
      </View>
    </Animated.View>
  );
}

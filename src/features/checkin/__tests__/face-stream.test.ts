import {
  faceStatus,
  orientedFrameSize,
  pickPictureSize,
  trackRectInView,
  type FaceTrack,
} from '../face-stream';

// Quét khuôn mặt trực tiếp khi chấm công: chọn cỡ ảnh nhẹ, đổi toạ độ khuôn mặt (ảnh không soi gương) sang khung xem
// trước (soi gương, lấp đầy), trạng thái hiển thị theo tracks + kết quả so của máy chủ.

const track = (state: FaceTrack['state'], id = 't1'): FaceTrack => ({ trackId: id, bbox: [100, 160, 300, 400], confidence: 0.9, state });

describe('pickPictureSize', () => {
  it('picks the smallest 4:3 size with a long side of at least 640', () => {
    expect(pickPictureSize(['4000x3000', '1920x1080', '1280x960', '640x480', '320x240'])).toBe('640x480');
    expect(pickPictureSize(['1920x1080', '1280x720'])).toBe('1280x720');
  });

  it('ignores iOS presets and returns undefined when nothing fits', () => {
    expect(pickPictureSize(['Photo', 'High', 'Medium', '640x480'])).toBe('640x480');
    expect(pickPictureSize(['Photo', 'High', '352x288'])).toBeUndefined();
  });
});

describe('orientedFrameSize', () => {
  it('turns a landscape sensor image into a portrait frame on a portrait screen', () => {
    expect(orientedFrameSize(640, 480, true)).toEqual({ width: 480, height: 640 });
    expect(orientedFrameSize(480, 640, false)).toEqual({ width: 640, height: 480 });
  });
});

describe('trackRectInView', () => {
  it('scales to the preview and mirrors x for the front camera', () => {
    // Khung 480x640 hiển thị ở 360x480 → hệ số 0.75; soi gương: x1' = 480 − 300 = 180.
    expect(trackRectInView([100, 160, 300, 400], { width: 480, height: 640 }, { width: 360, height: 480 })).toEqual({
      left: 135,
      top: 120,
      width: 150,
      height: 180,
    });
  });

  it('crops the overflow when the preview has a different shape (cover)', () => {
    // Khung 480x640 lấp đầy 480x480 → hệ số 1, cắt 80 px trên và dưới.
    const rect = trackRectInView([0, 80, 480, 560], { width: 480, height: 640 }, { width: 480, height: 480 }, false);
    expect(rect).toEqual({ left: 0, top: 0, width: 480, height: 480 });
  });
});

describe('faceStatus', () => {
  it('follows the face service and the 1:1 result for the single face in frame', () => {
    expect(faceStatus([], null)).toBe('searching');
    expect(faceStatus([track('TRACKING'), track('TRACKING', 't2')], null)).toBe('multi');
    expect(faceStatus([track('TRACKING')], null)).toBe('detecting');
    expect(faceStatus([track('LIVENESS_FAILED')], null)).toBe('spoof');
    expect(faceStatus([track('EMBEDDED')], null)).toBe('live');
    expect(faceStatus([track('EMBEDDED')], { trackId: 't1', matched: true, similarity: 0.71 })).toBe('matched');
    expect(faceStatus([track('EMBEDDED')], { trackId: 't1', matched: false, similarity: 0.12 })).toBe('mismatch');
    // Kết quả của một khuôn mặt khác (đã rời khung) không áp vào khuôn mặt hiện tại.
    expect(faceStatus([track('EMBEDDED', 't2')], { trackId: 't1', matched: true, similarity: 0.71 })).toBe('live');
  });
});

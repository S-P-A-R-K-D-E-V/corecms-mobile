jest.mock('react-native-view-shot', () => 'ViewShot');
jest.mock('expo-camera', () => ({ CameraView: 'CameraView' }));

import { stampSize } from 'src/features/checkin/FaceCaptureModal';
import { extractApiError } from 'src/services/error';
import { createSteadyTracker, readyToSave, TICK_COUNT } from '../face-id-geometry';

describe('stampSize (ảnh chấm công gửi nhóm)', () => {
  it('caps the width at 720 px and keeps the frame ratio', () => {
    expect(stampSize({ width: 390, height: 844 })).toEqual({ width: 720, height: 1558 });
  });
  it('lets view-shot decide before the frame is measured', () => {
    expect(stampSize(null)).toEqual({});
  });
});

// Chủ báo 2026-10-22: xoay đủ vòng tròn mà app không làm gì — bản trước đo "đứng yên" bằng tốc độ giữa hai khung, ML Kit
// rung 1–3° mỗi khung (33 ms) nên không bao giờ "yên", không chụp được ảnh nghiêng nào, không lưu.
describe('createSteadyTracker (chụp ảnh nghiêng khi đầu đã yên)', () => {
  it('treats ML Kit jitter of ±2° every 33 ms as steady after the window', () => {
    const tracker = createSteadyTracker();
    let steady = false;
    for (let i = 0; i <= 12; i++) {
      const jitter = i % 2 === 0 ? 2 : -2;
      steady = tracker.observe(i * 33, 20 + jitter, 5 - jitter);
    }
    expect(steady).toBe(true);
  });

  it('is not steady while the head is still turning', () => {
    const tracker = createSteadyTracker();
    let steady = true;
    for (let i = 0; i <= 12; i++) steady = tracker.observe(i * 33, i * 1.5, 0); // 45°/giây
    expect(steady).toBe(false);
  });
});

describe('readyToSave', () => {
  const full = Array(TICK_COUNT).fill(true);
  const half = Array(TICK_COUNT).fill(false).map((_, i) => i < TICK_COUNT / 2);
  it('saves with 3 angle photos once the ring is lit', () => {
    expect(readyToSave(full, 3, 0)).toBe(true);
    expect(readyToSave(half, 3, 0)).toBe(false);
  });
  it('saves with 2 angle photos shortly after the ring is lit instead of waiting 40 s', () => {
    expect(readyToSave(full, 2, 0)).toBe(false);
    expect(readyToSave(full, 2, 3000)).toBe(true);
    expect(readyToSave(full, 1, 10_000)).toBe(false);
  });
});

describe('extractApiError — lỗi mạng', () => {
  it('says the network is weak instead of an English technical message', () => {
    expect(extractApiError('Something went wrong')).toMatch(/Mạng yếu/);
    expect(extractApiError(new TypeError('Network request failed'))).toMatch(/Mạng yếu/);
    expect(extractApiError({ errors: { 'FaceTracking.NotEnoughGoodPhotos': ['Nhiều ảnh góc nghiêng bị mờ'] } })).toBe(
      'Nhiều ảnh góc nghiêng bị mờ',
    );
  });
});

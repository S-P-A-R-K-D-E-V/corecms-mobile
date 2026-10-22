jest.mock('react-native-view-shot', () => 'ViewShot');
jest.mock('expo-camera', () => ({ CameraView: 'CameraView' }));

import { stampSize } from 'src/features/checkin/FaceCaptureModal';
import { extractApiError } from 'src/services/error';
import { headSpeed } from '../FaceIdEnrollModal';

describe('stampSize (ảnh chấm công gửi nhóm)', () => {
  it('caps the width at 720 px and keeps the frame ratio', () => {
    expect(stampSize({ width: 390, height: 844 })).toEqual({ width: 720, height: 1558 });
  });
  it('lets view-shot decide before the frame is measured', () => {
    expect(stampSize(null)).toEqual({});
  });
});

describe('headSpeed (chỉ chụp ảnh nghiêng khi đầu đứng yên)', () => {
  it('measures degrees per second between frames', () => {
    expect(headSpeed({ yaw: 10, pitch: 0, t: 1000 }, { yaw: 13, pitch: 0, t: 1100 })).toBeCloseTo(30);
    expect(headSpeed(null, { yaw: 0, pitch: 0, t: 0 })).toBe(Infinity);
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

import { renderHook, waitFor, act } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { getBranchLocations } from 'src/api/attendance';
import { useGpsGate } from '../use-gps-gate';

// Cổng GPS dùng cho Kiểm quầy: chặn cứng + bắt buộc trong cửa hàng → mọi lỗi kiểm tra đều CHẶN.

jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('src/api/attendance', () => ({ getBranchLocations: jest.fn() }));

const loc = Location as jest.Mocked<typeof Location>;
const branches = getBranchLocations as jest.Mock;

const store = { latitude: 10.7769, longitude: 106.7009 };
const cici = { id: 'b1', branchName: 'CiCi Q1', geofenceRadius: 100, isActive: true, createdDate: '', ...store };

function position(coords: { latitude: number; longitude: number; accuracy?: number }, mocked = false) {
  return { coords: { altitude: null, altitudeAccuracy: null, heading: null, speed: null, accuracy: 10, ...coords }, timestamp: 0, mocked } as any;
}

const strict = { hardBlock: true, requireGeofence: true, maxAccuracy: 200, rejectMocked: true };

beforeEach(() => {
  jest.clearAllMocks();
  loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
  loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
  loc.getCurrentPositionAsync.mockResolvedValue(position(store));
  branches.mockResolvedValue([cici]);
});

describe('useGpsGate (kiểm quầy)', () => {
  it('ở cửa hàng, GPS tốt → cho qua kèm toạ độ', async () => {
    const { result } = renderHook(() => useGpsGate(strict));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.allowed).toBe(true);
    expect(result.current.reason).toBeNull();
    expect(result.current.coords).toMatchObject(store);
  });

  it('không tải được chi nhánh → chặn, không cho qua như trước', async () => {
    branches.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useGpsGate(strict));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.allowed).toBe(false);
    expect(result.current.reason).toBe('branches_error');
  });

  it('vị trí giả lập / sai số lớn / ngoài cửa hàng → chặn đúng lý do', async () => {
    loc.getCurrentPositionAsync.mockResolvedValueOnce(position(store, true));
    const mocked = renderHook(() => useGpsGate(strict));
    await waitFor(() => expect(mocked.result.current.status).toBe('ready'));
    expect(mocked.result.current).toMatchObject({ allowed: false, reason: 'mocked' });

    loc.getCurrentPositionAsync.mockResolvedValueOnce(position({ ...store, accuracy: 450 }));
    const blurry = renderHook(() => useGpsGate(strict));
    await waitFor(() => expect(blurry.result.current.status).toBe('ready'));
    expect(blurry.result.current).toMatchObject({ allowed: false, reason: 'low_accuracy' });

    loc.getCurrentPositionAsync.mockResolvedValueOnce(position({ latitude: 10.7869, longitude: 106.7009 }));
    const away = renderHook(() => useGpsGate(strict));
    await waitFor(() => expect(away.result.current.status).toBe('ready'));
    expect(away.result.current).toMatchObject({ allowed: false, reason: 'outside', within: false });
    expect(away.result.current.nearest?.branch.branchName).toBe('CiCi Q1');
  });

  it('từ chối quyền vị trí → chặn (permission), không đếm ngược cho qua', async () => {
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
    const { result } = renderHook(() => useGpsGate(strict));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({ allowed: false, reason: 'permission', countdown: null });
  });

  it('enabled=false → chưa hỏi quyền vị trí; bật lên mới lấy', async () => {
    const { result, rerender } = renderHook(({ enabled }: { enabled: boolean }) => useGpsGate({ ...strict, enabled }), {
      initialProps: { enabled: false },
    });
    expect(result.current.status).toBe('idle');
    expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(loc.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('lấy lại vị trí ngầm: ra khỏi cửa hàng thì chặn; sai số lớn thì giữ toạ độ cũ', async () => {
    const { result } = renderHook(() => useGpsGate(strict));
    await waitFor(() => expect(result.current.allowed).toBe(true));

    loc.getCurrentPositionAsync.mockResolvedValueOnce(position({ latitude: 10.7869, longitude: 106.7009, accuracy: 600 }));
    await act(async () => {
      await result.current.revalidate();
    });
    expect(result.current.allowed).toBe(true);

    loc.getCurrentPositionAsync.mockResolvedValueOnce(position({ latitude: 10.7869, longitude: 106.7009 }));
    await act(async () => {
      await result.current.revalidate();
    });
    expect(result.current).toMatchObject({ allowed: false, reason: 'outside' });
  });
});

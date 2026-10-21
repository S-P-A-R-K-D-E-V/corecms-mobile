jest.mock('expo-location', () => ({ watchPositionAsync: jest.fn(), Accuracy: { High: 4 } }));

import { createLocationStream } from '../location-stream';
import { firstNonNull, type RawFix } from '../location';

// Màn chấm công giữ GPS chạy liên tục — lúc gửi chỉ chờ điểm MỚI (sau ping), không nhận điểm cũ trong bộ đệm (trước đây
// check-in ngoài giờ bị ghi "GPS lỗi" vì máy chỉ trả điểm cũ).

const HERE = { latitude: 21.0363, longitude: 105.806, accuracy: 8 };
const fixAt = (timestamp: number): RawFix => ({ coords: HERE, timestamp, mocked: false });

function fakeWatch() {
  let emit: ((f: RawFix) => void) | null = null;
  const remove = jest.fn();
  const watch = jest.fn(async (onFix: (f: RawFix) => void) => {
    emit = onFix;
    return { remove };
  });
  return { watch, remove, emit: (f: RawFix) => emit?.(f) };
}

describe('locationStream', () => {
  beforeEach(() => jest.useRealTimers());

  it('waits for a fix taken after the given time and ignores the cached one', async () => {
    const w = fakeWatch();
    const stream = createLocationStream(w.watch);
    await stream.acquire();
    w.emit(fixAt(1_000)); // điểm cũ trong bộ đệm
    const pending = stream.nextFixSince(5_000, 5_000);
    w.emit(fixAt(4_000));
    w.emit(fixAt(5_200));
    await expect(pending).resolves.toEqual(fixAt(5_200));
  });

  it('returns the latest fix right away when it is already fresh', async () => {
    const w = fakeWatch();
    const stream = createLocationStream(w.watch);
    await stream.acquire();
    w.emit(fixAt(9_000));
    await expect(stream.nextFixSince(8_000, 5_000)).resolves.toEqual(fixAt(9_000));
  });

  it('gives up after the timeout', async () => {
    jest.useFakeTimers();
    const w = fakeWatch();
    const stream = createLocationStream(w.watch);
    await stream.acquire();
    const pending = stream.nextFixSince(5_000, 5_000);
    jest.advanceTimersByTime(5_000);
    await expect(pending).resolves.toBeNull();
  });

  it('keeps one GPS watch for several holders and stops it when the last one leaves', async () => {
    const w = fakeWatch();
    const stream = createLocationStream(w.watch);
    await stream.acquire(); // màn chấm công
    await stream.acquire(); // lần gửi
    expect(w.watch).toHaveBeenCalledTimes(1);
    stream.release();
    expect(w.remove).not.toHaveBeenCalled();
    stream.release();
    expect(w.remove).toHaveBeenCalledTimes(1);
    expect(stream.active).toBe(false);
  });
});

describe('firstNonNull', () => {
  it('takes the first real value, null only when every source is empty', async () => {
    const slow = new Promise<string | null>((r) => setTimeout(() => r('slow'), 20));
    await expect(firstNonNull([Promise.resolve(null), slow])).resolves.toBe('slow');
    await expect(firstNonNull([Promise.resolve(null), Promise.reject(new Error('x'))])).resolves.toBeNull();
  });
});

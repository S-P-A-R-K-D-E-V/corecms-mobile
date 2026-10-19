import { retryLocation, withTimeout } from '../location';

// Bấm check-in / check-out: GPS lỗi thì thử lại tới 5 giây, hết giờ thì vẫn cho chấm công (máy chủ đánh dấu).

function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const HERE = { latitude: 10.77, longitude: 106.7, accuracy: 12 };

describe('retryLocation', () => {
  it('returns as soon as a fix arrives, retrying failures in between', async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await retryLocation(
      async () => {
        calls += 1;
        clock.advance(500);
        if (calls < 3) throw new Error('no fix');
        return HERE;
      },
      5000,
      clock.now,
      clock.sleep,
    );
    expect(result).toEqual(HERE);
    expect(calls).toBe(3);
  });

  it('gives up after the 5 second window so check-in can go ahead without a location', async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await retryLocation(
      async (remaining) => {
        calls += 1;
        clock.advance(Math.min(1500, remaining));
        throw new Error('gps off');
      },
      5000,
      clock.now,
      clock.sleep,
    );
    expect(result).toBeNull();
    expect(clock.now()).toBeLessThanOrEqual(5000);
    expect(calls).toBeGreaterThan(1);
  });
});

describe('withTimeout', () => {
  it('rejects a position request that hangs', async () => {
    jest.useFakeTimers();
    const hanging = new Promise<number>(() => {});
    const p = withTimeout(hanging, 1000);
    jest.advanceTimersByTime(1000);
    await expect(p).rejects.toThrow('timeout');
    jest.useRealTimers();
  });
});

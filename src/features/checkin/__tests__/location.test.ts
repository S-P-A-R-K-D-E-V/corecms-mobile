import {
  acquireFreshFix,
  locationFields,
  retryLocation,
  sendWithFreshLocation,
  withTimeout,
  type LocationFix,
} from '../location';

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

// Lúc gửi chấm công: ping máy chủ rồi mới lấy điểm GPS — điểm cũ trong bộ đệm của máy không được gửi đi.
describe('acquireFreshFix', () => {
  it('skips a cached fix older than the ping and waits for a new one', async () => {
    const clock = fakeClock();
    clock.advance(100_000);
    const fixes = [
      { coords: HERE, timestamp: 40_000, mocked: false }, // điểm trong bộ đệm từ 60 giây trước
      { coords: { ...HERE, accuracy: 8 }, timestamp: 100_900, mocked: false },
    ];
    const attempts: number[] = [];
    const fix = await acquireFreshFix(
      async () => 'ping-token',
      async (_remaining, attempt) => {
        attempts.push(attempt);
        clock.advance(300);
        return fixes[attempt]!;
      },
      5000,
      clock.now,
      clock.sleep,
    );
    expect(fix).toEqual({ coords: { ...HERE, accuracy: 8 }, unavailable: false, token: 'ping-token', fixAt: 100_900, mocked: false });
    expect(attempts).toEqual([0, 1]);
  });

  it('treats "only stale fixes for 5 seconds" as a GPS failure', async () => {
    const clock = fakeClock();
    clock.advance(100_000);
    const fix = await acquireFreshFix(
      async () => null,
      async () => {
        clock.advance(400);
        return { coords: HERE, timestamp: 1_000, mocked: false };
      },
      5000,
      clock.now,
      clock.sleep,
    );
    expect(fix).toEqual({ coords: null, unavailable: true, token: null, fixAt: null, mocked: false });
  });
});

describe('locationFields', () => {
  it('sends the ping token and the fix age measured at send time', () => {
    const fix: LocationFix = { coords: HERE, unavailable: false, token: 't', fixAt: 10_000, mocked: true };
    expect(locationFields(fix, 12_500)).toEqual({
      latitude: 10.77,
      longitude: 106.7,
      accuracy: 12,
      locationUnavailable: false,
      locationToken: 't',
      locationAgeMs: 2_500,
      isMockLocation: true,
    });
  });

  it('flags a GPS failure without coordinates', () => {
    const fix: LocationFix = { coords: null, unavailable: true, token: null, fixAt: null, mocked: false };
    expect(locationFields(fix, 1)).toMatchObject({ latitude: undefined, locationUnavailable: true, locationAgeMs: undefined });
  });
});

describe('sendWithFreshLocation', () => {
  const fresh = (token: string): LocationFix => ({ coords: HERE, unavailable: false, token, fixAt: 1, mocked: false });

  it('pings and locates again once when the server says the location is stale', async () => {
    let n = 0;
    const locate = jest.fn(async () => fresh(`t${++n}`));
    const send = jest
      .fn()
      .mockRejectedValueOnce({ errorCodes: ['Attendance.LocationStale'] })
      .mockResolvedValueOnce('ok');
    const { result, fix } = await sendWithFreshLocation(locate, send);
    expect(result).toBe('ok');
    expect(fix.token).toBe('t2');
    expect(locate).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map((c) => c[0].token)).toEqual(['t1', 't2']);
  });

  it('does not retry other errors', async () => {
    const send = jest.fn().mockRejectedValue({ errors: { 'Attendance.OutsideGeofence': ['x'] } });
    await expect(sendWithFreshLocation(async () => fresh('t'), send)).rejects.toEqual({
      errors: { 'Attendance.OutsideGeofence': ['x'] },
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

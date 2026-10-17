// Kéo để làm mới: máy trạng thái của linh vật (đang tải → tải lâu → xong / lỗi → đóng khe) và hình linh vật.

jest.mock('src/services/haptics', () => ({ haptics: { light: jest.fn() } }));

import React from 'react';
import { act, render, renderHook } from '@testing-library/react-native';

import { isFailedRefresh, useRefreshMachine } from '../PullRefresh';
import { SparkMascot } from 'src/components/ui/spark-mascot';
import { haptics } from 'src/services/haptics';

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

function deferred() {
  let resolve!: (v?: unknown) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('isFailedRefresh', () => {
  it('reads react-query refetch results and arrays of them', () => {
    expect(isFailedRefresh(undefined)).toBe(false);
    expect(isFailedRefresh({ isError: false, status: 'success' })).toBe(false);
    expect(isFailedRefresh({ isError: true })).toBe(true);
    expect(isFailedRefresh({ status: 'error' })).toBe(true);
    expect(isFailedRefresh([{ isError: false }, { isError: true }])).toBe(true);
  });
});

describe('useRefreshMachine', () => {
  it('shows loading for at least 1.6 s, then done, then closes', async () => {
    const d = deferred();
    const close = jest.fn();
    const { result } = renderHook(() => useRefreshMachine({ onRefresh: () => d.promise, close }));

    act(() => {
      expect(result.current.start()).toBe(true);
    });
    expect(result.current.phase).toBe('loading');

    d.resolve({ isError: false });
    await flush();
    expect(result.current.phase).toBe('loading'); // chưa đủ 1,6 giây (mây chưa kịp trôi)

    act(() => jest.advanceTimersByTime(1600));
    expect(result.current.phase).toBe('done');
    expect(close).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(900));
    expect(close).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(300));
    expect(result.current.phase).toBe('rest');
  });

  it('turns to spin after 2 s and reports a failed refetch as error', async () => {
    const d = deferred();
    const { result } = renderHook(() => useRefreshMachine({ onRefresh: () => d.promise, close: jest.fn() }));
    act(() => {
      result.current.start();
    });
    act(() => jest.advanceTimersByTime(2000));
    expect(result.current.phase).toBe('slow');
    act(() => jest.advanceTimersByTime(2500));
    expect(result.current.slowNote).toBe(true);

    d.resolve({ isError: true });
    await flush();
    act(() => jest.advanceTimersByTime(0));
    expect(result.current.phase).toBe('error');
  });

  it('a rejected promise or a 15 s timeout is an error', async () => {
    const d = deferred();
    const { result } = renderHook(() => useRefreshMachine({ onRefresh: () => d.promise, close: jest.fn() }));
    act(() => {
      result.current.start();
    });
    d.reject(new Error('offline'));
    await flush();
    act(() => jest.advanceTimersByTime(1600));
    expect(result.current.phase).toBe('error');

    const never = renderHook(() => useRefreshMachine({ onRefresh: () => new Promise(() => {}), close: jest.fn() }));
    act(() => {
      never.result.current.start();
    });
    act(() => jest.advanceTimersByTime(15000));
    act(() => jest.advanceTimersByTime(1));
    expect(never.result.current.phase).toBe('error');
  });

  it('screens that do not return a promise finish when their refreshing flag goes true → false', () => {
    const onRefresh = jest.fn();
    const { result, rerender } = renderHook((p: { refreshing: boolean }) => useRefreshMachine({ onRefresh, refreshing: p.refreshing, close: jest.fn() }), {
      initialProps: { refreshing: false },
    });
    act(() => {
      result.current.start();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    rerender({ refreshing: true });
    act(() => jest.advanceTimersByTime(1500));
    expect(result.current.phase).toBe('loading'); // vẫn đang tải: cờ còn bật
    rerender({ refreshing: false });
    act(() => jest.advanceTimersByTime(100)); // đủ 1,6 s tối thiểu (đã qua 1,5 s)
    expect(result.current.phase).toBe('done');
  });

  it('ignores a second pull while busy and buzzes once when the threshold is reached', () => {
    const { result } = renderHook(() => useRefreshMachine({ onRefresh: () => new Promise(() => {}), close: jest.fn() }));
    act(() => result.current.setDrag('pull'));
    act(() => result.current.setDrag('armed'));
    act(() => result.current.setDrag('armed'));
    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('armed');

    act(() => {
      expect(result.current.start()).toBe(true);
    });
    act(() => {
      expect(result.current.start()).toBe(false);
    });
    act(() => result.current.setDrag('pull'));
    expect(result.current.phase).toBe('loading');
  });
});

describe('SparkMascot', () => {
  it('draws every mood', () => {
    for (const mood of ['idle', 'look', 'blink', 'spin', 'error'] as const) {
      const { toJSON, unmount } = render(<SparkMascot mood={mood} size={40} />);
      expect(toJSON()).toBeTruthy();
      unmount();
    }
  });
});

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCheckinData } from '../hooks';

jest.mock('src/api/attendance', () => ({
  getMyAttendanceLogs: jest.fn().mockResolvedValue([]),
  getMyAttendanceReport: jest.fn().mockResolvedValue(null),
}));
jest.mock('src/api/schedule', () => ({
  getMySchedule: jest.fn().mockResolvedValue([]),
}));

describe('useCheckinData().refetch', () => {
  it('invalidates the cleaning query key in addition to attendance/schedule', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCheckinData(), { wrapper });

    // Let the three initial queries settle (all act-wrapped by waitFor)
    // before triggering refetch, so no state update lands outside act().
    await waitFor(() => expect(result.current.refreshing).toBe(false));

    await act(async () => {
      await result.current.refetch();
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    const predicate = invalidateSpy.mock.calls[0][0]?.predicate as unknown as (q: { queryKey: unknown[] }) => boolean;
    expect(typeof predicate).toBe('function');

    // Pull-to-refresh must refresh the cleaning checklist summary card too —
    // this is the exact bug this test guards against regressing.
    expect(predicate({ queryKey: ['cleaning', 'my-checklist', '2026-07-24'] })).toBe(true);
    expect(predicate({ queryKey: ['attendance', 'logs', 'today'] })).toBe(true);
    expect(predicate({ queryKey: ['schedule', 'today'] })).toBe(true);
    // Unrelated query keys should NOT be invalidated by this refetch.
    expect(predicate({ queryKey: ['branches'] })).toBe(false);
  });
});

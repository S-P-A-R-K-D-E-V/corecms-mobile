import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { getMySchedule } from 'src/api/schedule';
import { getMyShiftRegistrations } from 'src/api/shiftRegistration';
import { getOpenPoolPosts, getMyPoolPosts, getMyClaims } from 'src/api/shiftPool';
import { useAuthContext } from 'src/auth/auth-context';
import type { IShiftPoolPost } from 'src/types/corecms-api';

/** Loads everything the schedule screen needs across a ±1 month window. */
export function useScheduleData(anchorDate: string) {
  const qc = useQueryClient();
  const { user } = useAuthContext();
  const from = dayjs(anchorDate).subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
  const to = dayjs(anchorDate).add(1, 'month').endOf('month').format('YYYY-MM-DD');

  const monthKey = dayjs(anchorDate).format('YYYY-MM');

  const scheduleQ = useQuery({ queryKey: ['schedule', 'range', monthKey], queryFn: () => getMySchedule(from, to) });
  const regsQ = useQuery({ queryKey: ['registrations', monthKey], queryFn: () => getMyShiftRegistrations(from, to) });
  const openQ = useQuery({ queryKey: ['pool', 'open'], queryFn: getOpenPoolPosts });
  const myPostsQ = useQuery({ queryKey: ['pool', 'mine'], queryFn: getMyPoolPosts });
  const claimsQ = useQuery({ queryKey: ['pool', 'claims'], queryFn: getMyClaims });

  const openPosts = useMemo(
    () => (openQ.data ?? []).filter((p: IShiftPoolPost) => p.posterId !== user?.id),
    [openQ.data, user?.id]
  );

  return {
    assignments: scheduleQ.data ?? [],
    registrations: regsQ.data ?? [],
    openPosts,
    myPosts: myPostsQ.data ?? [],
    myClaims: claimsQ.data ?? [],
    refreshing: scheduleQ.isFetching || openQ.isFetching || myPostsQ.isFetching || claimsQ.isFetching,
    refetch: () => qc.invalidateQueries({ predicate: (q) => ['schedule', 'registrations', 'pool'].includes(q.queryKey[0] as string) }),
  };
}

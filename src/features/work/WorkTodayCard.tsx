import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { SectionCard } from 'src/components/shared';
import { Text, Badge, Avatar, Button, Divider, Pressable, Skeleton, Icon } from 'src/components/ui';
import { getStorageUrl } from 'src/api/axios';
import { getWorkToday } from 'src/api/hr';
import { useAuthContext } from 'src/auth/auth-context';
import type { IWorkTodayPerson } from 'src/types/hr';

import { WORK_STATUS, canSeeWorkToday, donePct, itemRoute, itemSubtitle, progressText } from './work-today';

// ----------------------------------------------------------------------
// "Việc giao hôm nay" (dashboard chủ / quản lý): mỗi người bao nhiêu việc đã xong / chưa xong / quá hạn — việc trong ca, vệ sinh,
// việc giao riêng. Bấm một người để xem từng việc; bấm việc giao riêng để xem và chấm; nút cuối mở Việc theo ngày (ngày khác,
// đánh dấu xong / gỡ). core-be chưa có /work-today (404) hoặc không có quyền → thẻ ẩn.
// ----------------------------------------------------------------------

function PersonRow({ person }: { person: IWorkTodayPerson }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuthContext();
  const pct = donePct(person);
  return (
    <View>
      <Pressable onPress={() => setOpen((v) => !v)} className="flex-row items-center gap-3 py-2">
        <Avatar name={person.staffName} uri={person.avatarUrl ? getStorageUrl(person.avatarUrl) : null} size={36} />
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text variant="bodySmall" className="font-semibold flex-1" numberOfLines={1}>
              {person.staffName}
            </Text>
            <Text variant="caption" tone={person.overdue > 0 ? 'error' : 'muted'} className="font-semibold">
              {progressText(person)}
            </Text>
          </View>
          <View className="h-1.5 rounded-full bg-muted overflow-hidden">
            <View
              className={`h-1.5 rounded-full ${person.overdue > 0 ? 'bg-error' : pct >= 100 ? 'bg-success' : 'bg-primary'}`}
              style={{ width: `${Math.max(pct, person.done > 0 ? 4 : 0)}%` }}
            />
          </View>
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} tone="muted" />
      </Pressable>
      {open
        ? person.items.map((item) => {
            const route = itemRoute(item, user);
            return (
              <Pressable
                key={`${item.source}:${item.id}`}
                disabled={!route}
                onPress={() => route && router.push(route as any)}
                className="flex-row items-center gap-2 pl-12 pb-2"
              >
                <View className="flex-1">
                  <Text variant="caption" className="font-semibold" numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {itemSubtitle(item)}
                  </Text>
                </View>
                <Badge tone={WORK_STATUS[item.status]?.tone ?? 'neutral'}>{WORK_STATUS[item.status]?.label ?? item.status}</Badge>
                {route ? <Icon name="chevron-right" size={16} tone="muted" /> : null}
              </Pressable>
            );
          })
        : null}
    </View>
  );
}

export function WorkTodayCard() {
  const { user } = useAuthContext();
  const allowed = canSeeWorkToday(user);
  const today = dayjs().format('YYYY-MM-DD');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['home', 'work-today', today],
    queryFn: () => getWorkToday(),
    staleTime: 60_000,
    retry: false,
    enabled: allowed,
  });

  if (!allowed || isError) return null;

  return (
    <SectionCard
      title="Việc giao hôm nay"
      icon="clipboard-check-outline"
      right={<Text variant="caption" tone="muted">{dayjs().format('DD/MM')}</Text>}
      bodyClassName="pt-0"
    >
      {isLoading || !data ? (
        <Skeleton width="100%" height={96} radius={12} />
      ) : data.people.length === 0 ? (
        <View className="items-center py-3 gap-1">
          <Icon name="clipboard-outline" size={26} tone="faint" />
          <Text variant="bodySmall" tone="muted">Hôm nay chưa có việc giao cho ai.</Text>
        </View>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-x-3 gap-y-1 mb-1">
            <Text variant="caption" tone="muted">
              Xong <Text variant="caption" className="font-bold">{data.counts.done}/{data.counts.total}</Text>
            </Text>
            <Text variant="caption" tone="muted">
              Chưa xong <Text variant="caption" className="font-bold">{data.counts.pending}</Text>
            </Text>
            {data.counts.overdue > 0 ? (
              <Text variant="caption" tone="error" className="font-semibold">
                Quá hạn / không đạt {data.counts.overdue}
              </Text>
            ) : null}
          </View>
          {data.people.map((p, i) => (
            <View key={p.staffId}>
              {i > 0 ? <Divider className="ml-12" /> : null}
              <PersonRow person={p} />
            </View>
          ))}
        </>
      )}
      {!isLoading && data ? (
        <Button size="sm" variant="outline" icon="calendar-check-outline" onPress={() => router.push('/manage/work-day' as any)} className="mt-2">
          Việc theo ngày · đánh dấu xong / gỡ
        </Button>
      ) : null}
    </SectionCard>
  );
}

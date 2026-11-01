import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { AppHeader, Loading, Screen, SectionCard } from 'src/components/shared';
import { Button, Text } from 'src/components/ui';
import { getNotification, markAsRead } from 'src/api/notifications';
import { openInAppBrowser } from 'src/features/assistant/links';
import { extractApiError } from 'src/services/error';
import { notificationAppRoute, notificationWebUrl } from 'src/services/notification-links';
import { getWebOrigin, isMultiStore, storeDomain } from 'src/services/store-config';

// ----------------------------------------------------------------------
// Chi tiết thông báo: toàn bộ nội dung (danh sách chỉ hiện 2 dòng) và nút tới trang tính năng nếu có.
// Mở trang này là đã đọc.
// ----------------------------------------------------------------------

export function NotificationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: ['notifications', 'detail', id], queryFn: () => getNotification(id), enabled: !!id, retry: false });
  const item = query.data;

  useEffect(() => {
    if (item && !item.isRead) markAsRead(item.id).catch(() => {});
  }, [item]);

  const appRoute = notificationAppRoute(item?.actionUrl);
  const webUrl = appRoute ? null : notificationWebUrl(item?.actionUrl, isMultiStore && !storeDomain() ? null : getWebOrigin());

  return (
    <Screen scroll>
      <AppHeader title="Chi tiết thông báo" back />
      {query.isLoading ? (
        <Loading />
      ) : query.isError || !item ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được thông báo: {extractApiError(query.error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
        </View>
      ) : (
        <SectionCard title={item.title} bodyClassName="pt-0 gap-3">
          <Text variant="caption" tone="faint">
            {dayjs(item.createdAt).format('HH:mm DD/MM/YYYY')}
            {item.createdByName ? ` · ${item.createdByName}` : ''}
          </Text>
          <Text variant="body" selectable>{item.body}</Text>
          {appRoute ? (
            <Button icon="chevron-right" onPress={() => router.push(appRoute as any)}>Mở trang liên quan</Button>
          ) : webUrl ? (
            <Button variant="outline" icon="open-in-new" onPress={() => openInAppBrowser(webUrl)}>Mở trên web</Button>
          ) : null}
        </SectionCard>
      )}
    </Screen>
  );
}

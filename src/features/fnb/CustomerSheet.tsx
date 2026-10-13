import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { searchFnbCustomers } from 'src/api/fnb';
import { Sheet } from 'src/components/shared';
import { Button, Pressable, Spinner, Text, TextField } from 'src/components/ui';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';
import type { IOpenOrder } from 'src/types/fnb';

import { customerLabel } from './order-extras';

// ----------------------------------------------------------------------
// Gắn khách hàng vào đơn mở: tìm theo tên / số điện thoại (cần mạng), chạm để gắn; bỏ khách hàng khỏi đơn. Khách hàng
// dùng chung cả cửa hàng (bán lẻ và F&B). Thêm khách mới làm ở trang web.
// ----------------------------------------------------------------------

export function CustomerSheet({
  order,
  visible,
  onClose,
  onConfirm,
}: {
  order: IOpenOrder | null | undefined;
  visible: boolean;
  onClose: () => void;
  onConfirm: (customerId: string | null) => void | Promise<void>;
}) {
  const [keyword, setKeyword] = useState('');
  // Chờ ngừng gõ 300 ms rồi mới tìm.
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setKeyword('');
  }, [visible]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(keyword.trim()), 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const customersQ = useQuery({
    queryKey: ['fnb', 'customers', query],
    queryFn: () => searchFnbCustomers(query),
    enabled: visible && query.length >= 2,
  });

  return (
    <Sheet
      visible={visible}
      title={t('fnbExtras.customerTitle')}
      onClose={onClose}
      footer={
        order?.customerId ? (
          <Button variant="outline" icon="account-remove-outline" onPress={() => void onConfirm(null)}>
            {t('fnbExtras.customerClear', { name: order.customerName ?? '' })}
          </Button>
        ) : undefined
      }
    >
      <View className="gap-3">
        <TextField
          label={t('fnbExtras.customerSearch')}
          value={keyword}
          onChangeText={setKeyword}
          maxLength={50}
        />
        {query.length < 2 ? (
          <Text variant="caption" tone="muted">{t('fnbExtras.customerHint')}</Text>
        ) : customersQ.isLoading ? (
          <View className="py-6 items-center"><Spinner /></View>
        ) : customersQ.isError ? (
          <Text variant="bodySmall" tone="error">{extractApiError(customersQ.error)}</Text>
        ) : (
          <View>
            {(customersQ.data ?? []).slice(0, 30).map((c) => (
              <Pressable
                key={c.id}
                onPress={() => void onConfirm(c.id)}
                className="py-2.5 border-b border-line dark:border-line-dark"
              >
                <Text variant="bodySmall" tone={c.id === order?.customerId ? 'primary' : 'default'} className="font-semibold">
                  {customerLabel(c)}
                </Text>
              </Pressable>
            ))}
            {(customersQ.data ?? []).length === 0 ? (
              <Text variant="bodySmall" tone="muted" className="py-4 text-center">{t('fnbExtras.customerEmpty')}</Text>
            ) : null}
          </View>
        )}
      </View>
    </Sheet>
  );
}

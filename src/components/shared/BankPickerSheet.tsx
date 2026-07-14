import { useEffect, useMemo, useState } from 'react';
import { View, FlatList, Image } from 'react-native';

import { Sheet } from './Sheet';
import { Text, TextField, Pressable, Spinner } from '../ui';
import { getVietQRBanks } from 'src/api/bank-accounts';
import type { IVietQRBank } from 'src/types/corecms-api';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (bank: IVietQRBank) => void;
};

/** Bottom sheet chọn ngân hàng chuẩn VietQR — đảm bảo mã ngân hàng lưu vào
 *  `bankCode` luôn hợp lệ để dựng ảnh QR (giống cách core-fe làm). */
export function BankPickerSheet({ visible, onClose, onSelect }: Props) {
  const [banks, setBanks] = useState<IVietQRBank[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible || banks.length > 0) return;
    setLoading(true);
    getVietQRBanks()
      .then(setBanks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, banks.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.shortName.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q)
    );
  }, [banks, query]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Chọn ngân hàng">
      <View className="gap-2">
        <TextField
          placeholder="Tìm theo tên hoặc mã ngân hàng..."
          value={query}
          onChangeText={setQuery}
          icon="magnify"
          autoFocus
        />
        <View style={{ height: 420 }}>
          {loading ? (
            <View className="flex-1 items-center justify-center py-10">
              <Spinner />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(b) => String(b.id)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  className="flex-row items-center gap-3 py-3 border-b border-line/50 dark:border-line-dark/50"
                >
                  <Image
                    source={{ uri: item.logo }}
                    style={{ width: 32, height: 32, borderRadius: 6 }}
                    resizeMode="contain"
                  />
                  <View className="flex-1">
                    <Text className="font-semibold">{item.shortName}</Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text tone="faint" className="text-center py-8">
                  Không tìm thấy ngân hàng phù hợp.
                </Text>
              }
            />
          )}
        </View>
      </View>
    </Sheet>
  );
}

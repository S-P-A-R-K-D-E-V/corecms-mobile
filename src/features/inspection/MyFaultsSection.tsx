import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Text, Button } from 'src/components/ui';
import { getOpenInspectionFaults } from 'src/api/inspection';
import type { IInspectionFault } from 'src/types/inspection';
import { FaultCard, FixSheet } from './InspectionFaultsScreen';

// ----------------------------------------------------------------------
// Lỗi cần sửa của tôi (đang mở) trong màn Việc của tôi — cùng cache với màn Lỗi kiểm tra và trang chủ. Lịch sử cả tháng
// xem ở màn Lỗi kiểm tra.
// ----------------------------------------------------------------------

export function MyFaultsSection({ enabled = true }: { enabled?: boolean }) {
  const qc = useQueryClient();
  const [fixing, setFixing] = useState<IInspectionFault | null>(null);
  const query = useQuery({ queryKey: ['inspection', 'faults', 'open'], queryFn: () => getOpenInspectionFaults('mine'), enabled });

  const open = (query.data ?? []).filter((f) => !f.fixedAt);
  if (!enabled || open.length === 0) return null;

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="subtitle">Lỗi cần sửa</Text>
        <Button size="sm" variant="ghost" fullWidth={false} onPress={() => router.push('/inspection/faults' as any)}>
          Xem tất cả
        </Button>
      </View>
      {open.map((f) => (
        <FaultCard key={f.resultId} fault={f} canFix onFix={() => setFixing(f)} />
      ))}
      <FixSheet
        fault={fixing}
        onClose={() => setFixing(null)}
        onDone={() => {
          setFixing(null);
          qc.invalidateQueries({ queryKey: ['inspection'] });
        }}
      />
    </View>
  );
}

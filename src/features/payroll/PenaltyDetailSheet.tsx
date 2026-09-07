import { View } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Text, Icon, Spinner } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import type { IPayrollPenaltyDetailItem } from 'src/types/corecms-api';
import { usePayrollPenaltyDetails, fmtMoney } from './hooks';

// ----------------------------------------------------------------------
// Sheet "Chi tiết khoản phạt" — bấm vào dòng "Tiền phạt" ở màn chi tiết lương
// để xem từng khoản đã cộng dồn thành penaltyAmount (đi muộn/về sớm/vắng/quên
// checkin-checkout/phạt vệ sinh/phạt thủ công). Chỉ tự fetch khi mở (enabled).
// ----------------------------------------------------------------------

const ITEM_TYPE_ICON: Record<string, IconNameLike> = {
  Penalty: 'clock-outline',
  ManualPenalty: 'pencil-outline',
  CleaningPenalty: 'broom',
};

// Icon component nhận IconName riêng của app — khai kiểu lỏng để không phải import type nặng.
type IconNameLike = React.ComponentProps<typeof Icon>['name'];

function PenaltyRow({ item }: { item: IPayrollPenaltyDetailItem }) {
  return (
    <View className="flex-row items-start gap-2.5 py-1.5">
      <Icon name={ITEM_TYPE_ICON[item.itemType] ?? 'alert-circle-outline'} size={18} tone="error" />
      <Text className="flex-1" variant="bodySmall">{item.description}</Text>
      <Text className="font-semibold" variant="bodySmall" tone="error">
        -{fmtMoney(Math.abs(item.amount))}
      </Text>
    </View>
  );
}

export function PenaltyDetailSheet({
  visible,
  payrollRecordId,
  onClose,
}: {
  visible: boolean;
  payrollRecordId: string;
  onClose: () => void;
}) {
  const { data: items, isLoading, isError } = usePayrollPenaltyDetails(payrollRecordId, visible);
  const total = (items ?? []).reduce((sum, i) => sum + i.amount, 0);

  return (
    <Sheet visible={visible} title="Chi tiết khoản phạt" onClose={onClose}>
      <View className="gap-3 pb-2">
        {isLoading ? (
          <View className="items-center py-6">
            <Spinner />
          </View>
        ) : isError ? (
          <Text tone="error" className="text-center py-4">Không tải được chi tiết khoản phạt.</Text>
        ) : !items || items.length === 0 ? (
          <View className="items-center gap-2 py-6">
            <Icon name="check-circle-outline" size={36} tone="success" />
            <Text tone="muted">Kỳ này không có khoản phạt nào.</Text>
          </View>
        ) : (
          <>
            <View className={cn('rounded-2xl bg-ink/[0.03] dark:bg-white/[0.04] px-3')}>
              {items.map((item, i) => (
                <View key={item.id}>
                  <PenaltyRow item={item} />
                  {i < items.length - 1 ? <View className="h-px bg-line dark:bg-line-dark" /> : null}
                </View>
              ))}
            </View>
            <View className="flex-row items-center justify-between pt-1">
              <Text className="font-bold">Tổng tiền phạt</Text>
              <Text className="font-bold text-lg" tone="error">-{fmtMoney(Math.abs(total))}</Text>
            </View>
          </>
        )}
      </View>
    </Sheet>
  );
}

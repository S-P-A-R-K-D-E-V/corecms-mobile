import { useMemo } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';

import { Sheet } from 'src/components/shared';
import { Button, Text, Badge, Icon, Skeleton, Divider } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';

import { useSalaryConfigPreview, useRecalculateMany } from './hooks';

// ----------------------------------------------------------------------
// Popup xác nhận TÍNH LẠI lương: hiện cấu hình lương hiện tại của các nhân
// viên sẽ tính lại (toàn kỳ = mọi NV chưa chốt; 1 NV = 1 dòng), cảnh báo NV
// thiếu cấu hình, rồi xác nhận. Tính lại tuần tự từng record (bỏ qua đã chốt).
// ----------------------------------------------------------------------

const UNIT: Record<string, string> = { PerShift: 'đ/ca', Hourly: 'đ/giờ', Monthly: 'đ/tháng' };

export type RecalcTarget = { recordId: string; userId: string; userName: string };

export function RecalcConfirmSheet({
  visible,
  onClose,
  fromDate,
  targets,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  fromDate?: string;
  targets: RecalcTarget[];
  onDone?: () => void;
}) {
  const previewQ = useSalaryConfigPreview(visible ? fromDate : undefined);
  const recalcM = useRecalculateMany();

  const configByUser = useMemo(() => {
    const m = new Map<string, { hasActiveConfig: boolean; activeConfig?: any }>();
    for (const it of previewQ.data ?? []) m.set(it.userId, it);
    return m;
  }, [previewQ.data]);

  const missingCount = useMemo(
    () => targets.filter((t) => !configByUser.get(t.userId)?.hasActiveConfig).length,
    [targets, configByUser]
  );

  async function confirm() {
    if (targets.length === 0) return;
    try {
      const res = await recalcM.mutateAsync(targets.map((t) => t.recordId));
      haptics.success();
      toast.success(`Đã tính lại ${res.success}${res.failed ? ` · lỗi ${res.failed}` : ''} nhân viên.`, 'Hoàn tất');
      onClose();
      onDone?.();
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không tính lại được');
    }
  }

  return (
    <Sheet
      visible={visible}
      title={targets.length > 1 ? 'Tính lại lương (chưa chốt)' : 'Tính lại lương'}
      onClose={onClose}
      footer={
        <Button fullWidth loading={recalcM.isPending} disabled={targets.length === 0} onPress={confirm} icon="calculator-variant-outline">
          Xác nhận tính lại ({targets.length})
        </Button>
      }
    >
      <View className="gap-2">
        <Text variant="bodySmall" tone="muted">
          Áp cấu hình lương hiện tại và tính lại {targets.length} nhân viên. Bảng đã chốt được giữ nguyên.
        </Text>
        {missingCount > 0 ? (
          <View className="flex-row items-center gap-2 px-3 py-2 rounded-xl bg-warning-soft">
            <Icon name="alert-outline" size={16} tone="warning" />
            <Text variant="caption" tone="warning" className="font-semibold flex-1">
              {missingCount} nhân viên chưa có cấu hình lương — sẽ tính ra 0đ cho đến khi đặt mức.
            </Text>
          </View>
        ) : null}

        {previewQ.isLoading ? (
          <Skeleton width="100%" height={120} radius={12} />
        ) : (
          <View>
            {targets.map((t, i) => {
              const cfg = configByUser.get(t.userId)?.activeConfig;
              const has = configByUser.get(t.userId)?.hasActiveConfig;
              return (
                <View key={t.recordId}>
                  {i > 0 ? <Divider /> : null}
                  <View className="flex-row items-center gap-2 py-2">
                    <View className="flex-1">
                      <Text variant="bodySmall" className="font-medium" numberOfLines={1}>{t.userName}</Text>
                      {has && cfg ? (
                        <Text variant="caption" tone="muted">
                          {Number(cfg.amount).toLocaleString('vi-VN')} {UNIT[cfg.salaryType] ?? ''}
                          {cfg.probationRate != null ? ` · TV ${cfg.probationRate}%` : ''} · từ {dayjs(cfg.effectiveFrom).format('DD/MM/YYYY')}
                        </Text>
                      ) : (
                        <Text variant="caption" tone="warning">Chưa có cấu hình lương</Text>
                      )}
                    </View>
                    <Badge tone={has ? 'success' : 'warning'}>{has ? 'OK' : 'Thiếu'}</Badge>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </Sheet>
  );
}

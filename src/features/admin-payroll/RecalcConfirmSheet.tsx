import { useMemo, useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';

import { Sheet } from 'src/components/shared';
import { Button, Text, Badge, Icon, Skeleton, Divider, Pressable, TextField, SegmentedControl } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import type { SalaryType } from 'src/types/corecms-api';

import { useSalaryConfigPreview, useRecalculateMany, useUpsertSalaryConfig } from './hooks';

// ----------------------------------------------------------------------
// Popup xác nhận TÍNH LẠI lương: hiện cấu hình lương hiện tại của các nhân
// viên sẽ tính lại (toàn kỳ = mọi NV chưa chốt; 1 NV = 1 dòng), cảnh báo NV
// thiếu cấu hình. CHỈNH SỬA ĐƯỢC ngay tại đây (như core-fe): mỗi dòng có nút
// sửa → đặt mức mới (hiệu lực từ đầu kỳ để áp cho kỳ này), lưu xong xác nhận
// sẽ tính lại với cấu hình đang áp dụng. Tính lại tuần tự từng record.
// ----------------------------------------------------------------------

const UNIT: Record<string, string> = { PerShift: 'đ/ca', Hourly: 'đ/giờ', Monthly: 'đ/tháng' };
const TYPES: { key: SalaryType; label: string }[] = [
  { key: 'PerShift', label: 'Theo ca' },
  { key: 'Hourly', label: 'Theo giờ' },
  { key: 'Monthly', label: 'Theo tháng' },
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type RecalcTarget = { recordId: string; userId: string; userName: string };

type EditState = { type: SalaryType; amount: string; probation: string; effectiveFrom: string; error: string };

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
  const upsertM = useUpsertSalaryConfig();

  const [editing, setEditing] = useState<string | null>(null); // userId đang sửa
  const [edit, setEdit] = useState<EditState | null>(null);

  const configByUser = useMemo(() => {
    const m = new Map<string, { hasActiveConfig: boolean; activeConfig?: any }>();
    for (const it of previewQ.data ?? []) m.set(it.userId, it);
    return m;
  }, [previewQ.data]);

  const missingCount = useMemo(
    () => targets.filter((t) => !configByUser.get(t.userId)?.hasActiveConfig).length,
    [targets, configByUser]
  );

  function startEdit(t: RecalcTarget) {
    const cfg = configByUser.get(t.userId)?.activeConfig;
    setEditing(t.userId);
    setEdit({
      type: (cfg?.salaryType as SalaryType) ?? 'PerShift',
      amount: cfg?.amount ? String(cfg.amount) : '',
      probation: cfg?.probationRate != null ? String(cfg.probationRate) : '',
      // Hiệu lực từ ĐẦU KỲ để mức mới áp cho kỳ đang tính lại.
      effectiveFrom: fromDate ?? dayjs().format('YYYY-MM-DD'),
      error: '',
    });
  }

  function cancelEdit() {
    setEditing(null);
    setEdit(null);
  }

  async function saveEdit(userId: string) {
    if (!edit) return;
    const amt = Number(edit.amount.replace(/[^\d.]/g, ''));
    if (!amt || amt <= 0) return setEdit({ ...edit, error: 'Nhập số tiền hợp lệ.' });
    if (!DATE_RE.test(edit.effectiveFrom)) return setEdit({ ...edit, error: 'Ngày hiệu lực phải dạng yyyy-MM-dd.' });
    const rate = edit.probation.trim() ? Number(edit.probation) : undefined;
    if (rate != null && (isNaN(rate) || rate < 0 || rate > 100)) return setEdit({ ...edit, error: '% thử việc phải trong 0–100.' });
    try {
      await upsertM.mutateAsync({
        userId,
        salaryType: edit.type,
        amount: amt,
        probationRate: rate,
        effectiveFrom: edit.effectiveFrom,
      });
      await previewQ.refetch();
      haptics.success();
      cancelEdit();
    } catch (e) {
      setEdit({ ...edit, error: extractApiError(e) });
    }
  }

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
        <Button fullWidth loading={recalcM.isPending} disabled={targets.length === 0 || !!editing} onPress={confirm} icon="calculator-variant-outline">
          Xác nhận tính lại ({targets.length})
        </Button>
      }
    >
      <View className="gap-2">
        <Text variant="bodySmall" tone="muted">
          Áp cấu hình lương hiện tại và tính lại {targets.length} nhân viên. Chạm biểu tượng bút để sửa mức ngay tại đây. Bảng đã chốt được giữ nguyên.
        </Text>
        {missingCount > 0 ? (
          <View className="flex-row items-center gap-2 px-3 py-2 rounded-xl bg-warning-soft">
            <Icon name="alert-outline" size={16} tone="warning" />
            <Text variant="caption" tone="warning" className="font-semibold flex-1">
              {missingCount} nhân viên chưa có cấu hình lương — sửa mức trước khi tính để không ra 0đ.
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
              const isEditing = editing === t.userId;
              return (
                <View key={t.recordId}>
                  {i > 0 ? <Divider /> : null}
                  <View className="py-2 gap-2">
                    <View className="flex-row items-center gap-2">
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
                      {!isEditing ? (
                        <>
                          <Badge tone={has ? 'success' : 'warning'}>{has ? 'OK' : 'Thiếu'}</Badge>
                          <Pressable
                            onPress={() => startEdit(t)}
                            disabled={!!editing}
                            className="w-8 h-8 items-center justify-center rounded-full bg-primary-soft"
                          >
                            <Icon name="pencil-outline" size={16} tone="primary" />
                          </Pressable>
                        </>
                      ) : null}
                    </View>

                    {isEditing && edit ? (
                      <View className="gap-2.5 p-3 rounded-xl bg-ink/5 dark:bg-white/5">
                        <SegmentedControl
                          segments={TYPES.map((x) => ({ key: x.key, label: x.label }))}
                          value={edit.type}
                          onChange={(k) => setEdit({ ...edit, type: k as SalaryType })}
                        />
                        <View className="flex-row gap-2">
                          <View className="flex-1">
                            <TextField
                              label={`Số tiền (${UNIT[edit.type]})`}
                              value={edit.amount}
                              onChangeText={(v) => setEdit({ ...edit, amount: v })}
                              placeholder="Vd: 20000"
                              keyboardType="number-pad"
                            />
                          </View>
                          <View style={{ width: 110 }}>
                            <TextField
                              label="TV %"
                              value={edit.probation}
                              onChangeText={(v) => setEdit({ ...edit, probation: v })}
                              placeholder="85"
                              keyboardType="number-pad"
                              maxLength={3}
                            />
                          </View>
                        </View>
                        <TextField
                          label="Hiệu lực từ ngày"
                          value={edit.effectiveFrom}
                          onChangeText={(v) => setEdit({ ...edit, effectiveFrom: v })}
                          placeholder="2026-06-01"
                          keyboardType="numbers-and-punctuation"
                          maxLength={10}
                        />
                        {edit.error ? <Text variant="caption" tone="error">{edit.error}</Text> : null}
                        <View className="flex-row gap-2">
                          <View className="flex-1">
                            <Button variant="soft" action="neutral" size="sm" onPress={cancelEdit} disabled={upsertM.isPending}>
                              Hủy
                            </Button>
                          </View>
                          <View className="flex-1">
                            <Button size="sm" icon="content-save-outline" loading={upsertM.isPending} onPress={() => saveEdit(t.userId)}>
                              Lưu mức
                            </Button>
                          </View>
                        </View>
                      </View>
                    ) : null}
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

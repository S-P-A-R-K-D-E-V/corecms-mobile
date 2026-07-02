import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader, StatCard, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Button, Icon, Skeleton, Divider, Pressable, TextField } from 'src/components/ui';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { cn } from 'src/components/ui/utils';
import { fmtMoney, fmtCompact } from 'src/features/admin-dashboard/hooks';
import type { IPayrollRecord } from 'src/types/corecms-api';

import { usePayrollByCycle, useBulkFinalize } from './hooks';
import { RecalcConfirmSheet, type RecalcTarget } from './RecalcConfirmSheet';

// ----------------------------------------------------------------------
// Chi tiết chu kỳ lương (Admin): tổng quan (tự tính từ records) + bảng lương
// theo nhân viên; nút "Tính lại toàn kỳ" (recalculate-cycle).
// ----------------------------------------------------------------------

function RecordCard({ r }: { r: IPayrollRecord }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/admin/payroll-record' as any, params: { recordId: r.id, userName: r.userName, finalized: String(r.isFinalized) } })}
      className="py-3 gap-1.5"
    >
      <View className="flex-row items-center justify-between">
        <Text variant="subtitle" className="flex-1" numberOfLines={1}>{r.userName}</Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-lg font-bold text-primary">{fmtMoney(r.totalSalary)}</Text>
          <Icon name="chevron-right" size={16} tone="faint" />
        </View>
      </View>
      <View className="flex-row flex-wrap gap-x-3 gap-y-1">
        <View className="flex-row items-center gap-1">
          <Icon name="check-circle-outline" size={13} tone="success" />
          <Text variant="caption" tone="muted">{r.presentShifts}/{r.totalShifts} ca · {r.totalHoursWorked.toFixed(1)}h</Text>
        </View>
        {r.bonus > 0 ? (
          <View className="flex-row items-center gap-1">
            <Icon name="gift-outline" size={13} tone="info" />
            <Text variant="caption" tone="muted">Thưởng {fmtCompact(r.bonus)}</Text>
          </View>
        ) : null}
        {r.penaltyAmount > 0 ? (
          <View className="flex-row items-center gap-1">
            <Icon name="alert-circle-outline" size={13} tone="warning" />
            <Text variant="caption" tone="muted">Phạt {fmtCompact(r.penaltyAmount)}</Text>
          </View>
        ) : null}
      </View>
      <View className="flex-row items-center justify-between">
        <Text variant="caption" tone="muted">Cơ bản {fmtCompact(r.baseSalary)}{r.overtimeSalary > 0 ? ` · OT ${fmtCompact(r.overtimeSalary)}` : ''}</Text>
        <Badge tone={r.isFinalized ? 'success' : 'warning'}>{r.isFinalized ? 'Đã chốt' : 'Tạm tính'}</Badge>
      </View>
    </Pressable>
  );
}

/** "Lương theo nhân viên" dạng agenda: gộp theo trạng thái (Chưa chốt / Đã chốt)
 *  với tiêu đề mốc + đếm số, kèm ô tìm kiếm theo tên. */
function EmployeeAgenda({ records, q, setQ }: { records: IPayrollRecord[]; q: string; setQ: (v: string) => void }) {
  const groups = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const filtered = kw ? records.filter((r) => r.userName.toLowerCase().includes(kw)) : records;
    const pending = filtered.filter((r) => !r.isFinalized);
    const done = filtered.filter((r) => r.isFinalized);
    return [
      { key: 'pending', label: 'Chưa chốt', tone: 'warning' as const, items: pending },
      { key: 'done', label: 'Đã chốt', tone: 'success' as const, items: done },
    ].filter((g) => g.items.length > 0);
  }, [records, q]);

  return (
    <Card className="p-4 gap-2">
      <View className="flex-row items-center gap-2">
        <Icon name="account-cash-outline" size={18} tone="primary" />
        <Text variant="subtitle" className="flex-1">Lương theo nhân viên</Text>
        <Badge tone="info">{records.length}</Badge>
      </View>
      <TextField icon="magnify" placeholder="Tìm nhân viên…" value={q} onChangeText={setQ} />

      {groups.length === 0 ? (
        <Text tone="muted" className="text-center py-6">Không tìm thấy nhân viên phù hợp</Text>
      ) : (
        groups.map((g) => (
          <View key={g.key} className="pt-1">
            <View className="flex-row items-center gap-2 py-1.5">
              <View className={cn('w-1.5 h-1.5 rounded-full', g.tone === 'warning' ? 'bg-warning' : 'bg-success')} />
              <Text variant="label" tone="muted" className="font-semibold">{g.label.toUpperCase()}</Text>
              <View className="flex-1 h-px bg-line dark:bg-line-dark" />
              <Text variant="caption" tone="faint">{g.items.length}</Text>
            </View>
            {g.items.map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <Divider /> : null}
                <RecordCard r={r} />
              </View>
            ))}
          </View>
        ))
      )}
    </Card>
  );
}

export function PayrollCycleDetailScreen() {
  const params = useLocalSearchParams<{ cycleId: string; name?: string }>();
  const cycleId = params.cycleId;
  const { data, isLoading, isError, refetch, isFetching } = usePayrollByCycle(cycleId);
  const bulkM = useBulkFinalize();
  const [recalcOpen, setRecalcOpen] = useState(false);
  const [q, setQ] = useState('');

  const { totals, pendingIds, pendingTargets } = useMemo(() => {
    const records = data?.records ?? [];
    const pending = records.filter((r) => !r.isFinalized);
    // Dữ liệu cũ có thể còn bản ghi TRÙNG (1 NV nhiều record/chu kỳ) — chỉ tính
    // lại 1 record/NV; BE tự dọn bản trùng khi tính lại nên loop không báo lỗi ảo.
    const seen = new Set<string>();
    const uniquePending = pending.filter((r) => (seen.has(r.userId) ? false : (seen.add(r.userId), true)));
    return {
      totals: {
        count: records.length,
        total: records.reduce((s, r) => s + r.totalSalary, 0),
        finalized: records.filter((r) => r.isFinalized).length,
      },
      pendingIds: pending.map((r) => r.id),
      pendingTargets: uniquePending.map<RecalcTarget>((r) => ({ recordId: r.id, userId: r.userId, userName: r.userName })),
    };
  }, [data]);

  async function finalizeAll() {
    if (pendingIds.length === 0) return;
    const ok = await confirm({
      title: 'Chốt cả kỳ',
      message: `Chốt ${pendingIds.length} bảng lương chưa chốt trong chu kỳ? Sau khi chốt sẽ khoá khỏi chỉnh sửa.`,
      confirmText: 'Chốt tất cả',
    });
    if (!ok) return;
    try {
      const res = await bulkM.mutateAsync({ payrollIds: pendingIds, isFinalized: true });
      haptics.success();
      toast.success(`Đã chốt ${res.successCount}${res.failedCount ? ` · lỗi ${res.failedCount}` : ''}.`, 'Chốt lương');
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không chốt được');
    }
  }

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader
        title={data?.cycleName ?? params.name ?? 'Bảng lương'}
        subtitle={data ? `${dayjs(data.fromDate).format('DD/MM')} – ${dayjs(data.toDate).format('DD/MM/YYYY')}` : 'Chi tiết chu kỳ'}
        back
      />

      {isLoading ? (
        <View className="gap-3">
          <View className="flex-row gap-3">
            <Skeleton width="31%" height={78} radius={16} />
            <Skeleton width="31%" height={78} radius={16} />
            <Skeleton width="31%" height={78} radius={16} />
          </View>
          <Skeleton width="100%" height={240} radius={16} />
        </View>
      ) : isError || !data ? (
        <ErrorView onRetry={refetch} />
      ) : (
        <>
          <View className="flex-row gap-3">
            <StatCard value={totals.count} label="Nhân viên" tone="info" />
            <StatCard value={fmtCompact(totals.total)} label="Tổng chi lương" tone="primary" />
            <StatCard value={`${totals.finalized}/${totals.count}`} label="Đã chốt" tone={totals.finalized === totals.count && totals.count > 0 ? 'success' : 'warning'} />
          </View>

          {!data.isLocked ? (
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button variant="soft" action="neutral" icon="calculator-variant-outline" disabled={pendingIds.length === 0} onPress={() => setRecalcOpen(true)}>
                  Tính lại{pendingIds.length ? ` ${pendingIds.length}` : ''}
                </Button>
              </View>
              <View className="flex-1">
                <Button action="primary" icon="lock-check-outline" disabled={pendingIds.length === 0} loading={bulkM.isPending} onPress={finalizeAll}>
                  Chốt kỳ{pendingIds.length ? ` ${pendingIds.length}` : ''}
                </Button>
              </View>
            </View>
          ) : (
            <View className="flex-row items-center gap-2 px-3.5 py-2.5 rounded-xl bg-error-soft">
              <Icon name="lock-outline" size={16} tone="error" />
              <Text variant="bodySmall" tone="error" className="font-semibold">Chu kỳ đã khoá — không thể tính lại.</Text>
            </View>
          )}

          {data.records.length === 0 ? (
            <EmptyState icon="cash-remove" title="Chưa có bảng lương" description="Chu kỳ này chưa tính lương nhân viên nào." />
          ) : (
            <EmployeeAgenda records={data.records} q={q} setQ={setQ} />
          )}
        </>
      )}

      {data ? (
        <RecalcConfirmSheet
          visible={recalcOpen}
          onClose={() => setRecalcOpen(false)}
          fromDate={dayjs(data.fromDate).format('YYYY-MM-DD')}
          targets={pendingTargets}
        />
      ) : null}
    </Screen>
  );
}

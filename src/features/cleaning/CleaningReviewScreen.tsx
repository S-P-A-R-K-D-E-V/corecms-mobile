import { useState } from 'react';
import { Image, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Badge, TextField, Icon, Pressable } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { getStorageUrl } from 'src/api/axios';
import {
  createCleaningPenalty,
  getCleaningChecklist,
  getShiftStaffForPenalty,
  reviewCleaningTask,
} from 'src/api/cleaning';
import type {
  CleaningShiftBlock,
  CleaningTaskStatus,
  ICleaningTaskInstance,
  IShiftStaffForPenalty,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Màn "Đánh giá vệ sinh" (Manager/Admin) — port từ core-fe
// src/sections/cleaning/cleaning-review-checklist.tsx. Giữ đúng logic:
//   - Chấm Đạt / Không đạt (kèm ghi chú) khi task ở Done hoặc Pending.
//   - Task Failed mới được áp phạt; chọn nhân viên trong ca, phạt mỗi người
//     cùng số tiền (amount > 0, ít nhất 1 người).

const BLOCKS: CleaningShiftBlock[] = ['Morning', 'Afternoon', 'Evening'];
const BLOCK_LABEL: Record<CleaningShiftBlock, string> = { Morning: 'Sáng', Afternoon: 'Chiều', Evening: 'Tối' };

const STATUS_TONE: Record<CleaningTaskStatus, 'neutral' | 'info' | 'success' | 'error'> = {
  Pending: 'neutral',
  Done: 'info',
  Passed: 'success',
  Failed: 'error',
};

const STATUS_LABEL: Record<CleaningTaskStatus, string> = {
  Pending: 'Chưa làm',
  Done: 'Chờ chấm',
  Passed: 'Đạt',
  Failed: 'Không đạt',
};

const formatVnd = (amount: number) => `${amount.toLocaleString('vi-VN')}đ`;

// ----------------------------------------------------------------------

function TaskRow({ task, onPass, onFail, onPenalty, onViewPhoto }: {
  task: ICleaningTaskInstance;
  onPass: (task: ICleaningTaskInstance) => void;
  onFail: (task: ICleaningTaskInstance) => void;
  onPenalty: (task: ICleaningTaskInstance) => void;
  onViewPhoto: (uri: string) => void;
}) {
  const activePenalties = task.penalties.filter((p) => !p.voidedAt);
  const canReview = task.status === 'Done' || task.status === 'Pending';

  return (
    <View className="py-2.5 gap-1.5">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1">
          <Text className="font-semibold text-[13px]">{task.name}</Text>
          <Text variant="caption" tone="muted">
            {[task.area, task.completedByUserName].filter(Boolean).join(' · ') || '—'}
          </Text>
        </View>
        <Badge tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
      </View>

      {task.photoObjectKeys.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {task.photoObjectKeys.map((key) => (
            <Pressable key={key} onPress={() => onViewPhoto(getStorageUrl(key))}>
              <Image source={{ uri: getStorageUrl(key) }} style={{ width: 48, height: 48, borderRadius: 8 }} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {task.status === 'Failed' && task.reviewNote ? (
        <Text variant="caption" tone="error">Ghi chú: {task.reviewNote}</Text>
      ) : null}

      {activePenalties.length > 0 ? (
        <View className="gap-0.5">
          {activePenalties.map((p) => (
            <Text key={p.id} variant="caption" tone="error" className="font-semibold">
              {p.userName}: {formatVnd(p.amount)}{p.reason ? ` — ${p.reason}` : ''}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="flex-row gap-2">
        {canReview ? (
          <>
            <View className="flex-1">
              <Button size="sm" icon="check-circle-outline" onPress={() => onPass(task)}>
                Đạt
              </Button>
            </View>
            <View className="flex-1">
              <Button size="sm" variant="outline" icon="close-circle-outline" onPress={() => onFail(task)}>
                Không đạt
              </Button>
            </View>
          </>
        ) : null}
        {task.status === 'Failed' ? (
          <View className="flex-1">
            <Button size="sm" variant="outline" icon="cash-remove" onPress={() => onPenalty(task)}>
              Phạt
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------

export function CleaningReviewScreen() {
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ date?: string; block?: string }>();

  const [date, setDate] = useState(() =>
    params.date && dayjs(params.date).isValid() ? dayjs(params.date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
  );
  const [block, setBlock] = useState<CleaningShiftBlock>(() =>
    BLOCKS.includes(params.block as CleaningShiftBlock) ? (params.block as CleaningShiftBlock) : 'Morning'
  );

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['cleaning', 'review-checklist', date, block],
    queryFn: () => getCleaningChecklist(date, block),
  });
  const tasks = data ?? [];

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fail sheet
  const [failTask, setFailTask] = useState<ICleaningTaskInstance | null>(null);
  const [failNote, setFailNote] = useState('');

  // Penalty sheet
  const [penaltyTask, setPenaltyTask] = useState<ICleaningTaskInstance | null>(null);
  const [staff, setStaff] = useState<IShiftStaffForPenalty[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['cleaning', 'review-checklist'] });
    qc.invalidateQueries({ queryKey: ['cleaning', 'week-overview'] });
  }

  async function handlePass(task: ICleaningTaskInstance) {
    setBusy(true);
    try {
      await reviewCleaningTask(task.id, { status: 'Passed' });
      toast.success('Đã đánh giá Đạt');
      invalidate();
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setBusy(false);
    }
  }

  function openFail(task: ICleaningTaskInstance) {
    setFailTask(task);
    setFailNote('');
  }

  async function handleSubmitFail() {
    if (!failTask) return;
    setBusy(true);
    try {
      await reviewCleaningTask(failTask.id, { status: 'Failed', reviewNote: failNote.trim() || undefined });
      toast.success('Đã đánh giá Không đạt');
      setFailTask(null);
      invalidate();
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function openPenalty(task: ICleaningTaskInstance) {
    setPenaltyTask(task);
    setStaff([]);
    setSelectedUserIds([]);
    setAmountText('');
    setReason('');
    setLoadingStaff(true);
    try {
      setStaff(await getShiftStaffForPenalty(task.id));
    } catch {
      toast.error('Không thể tải danh sách nhân viên trong ca');
    } finally {
      setLoadingStaff(false);
    }
  }

  function toggleStaff(userId: string) {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  async function handleSubmitPenalty() {
    if (!penaltyTask) return;
    const amount = Number(amountText.replace(/[^\d]/g, ''));
    if (selectedUserIds.length === 0) {
      toast.warning('Chọn ít nhất 1 nhân viên');
      return;
    }
    if (!amount || amount <= 0) {
      toast.warning('Số tiền phạt phải lớn hơn 0');
      return;
    }
    setBusy(true);
    try {
      await Promise.all(
        selectedUserIds.map((userId) =>
          createCleaningPenalty(penaltyTask.id, { userId, amount, reason: reason.trim() || undefined })
        )
      );
      toast.success('Đã áp phạt');
      setPenaltyTask(null);
      invalidate();
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Đánh giá vệ sinh" back />

      <View className="flex-row items-center justify-between gap-2 py-1">
        <Pressable
          onPress={() => setDate((d) => dayjs(d).subtract(1, 'day').format('YYYY-MM-DD'))}
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-left" size={20} tone="default" />
        </Pressable>
        <Text variant="subtitle" className="capitalize">{dayjs(date).format('dddd, DD/MM/YYYY')}</Text>
        <Pressable
          onPress={() => setDate((d) => dayjs(d).add(1, 'day').format('YYYY-MM-DD'))}
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-right" size={20} tone="default" />
        </Pressable>
      </View>

      <View className="flex-row gap-2 py-1">
        {BLOCKS.map((b) => (
          <View key={b} className="flex-1">
            <Button size="sm" variant={block === b ? 'solid' : 'outline'} onPress={() => setBlock(b)}>
              {BLOCK_LABEL[b]}
            </Button>
          </View>
        ))}
      </View>

      {isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">
            Không tải được checklist: {extractApiError(error)}
          </Text>
          <Button size="sm" variant="outline" onPress={() => refetch()}>Thử lại</Button>
        </View>
      ) : tasks.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted">Không có đầu việc nào cho ca này.</Text>
        </View>
      ) : (
        <SectionCard title={`Ca ${BLOCK_LABEL[block]}`} icon="broom" count={tasks.length}>
          <View>
            {tasks.map((task, i) => (
              <View key={task.id}>
                {i > 0 ? <View className="h-px bg-line/50 dark:bg-line-dark/50" /> : null}
                <TaskRow
                  task={task}
                  onPass={handlePass}
                  onFail={openFail}
                  onPenalty={openPenalty}
                  onViewPhoto={setPhotoUri}
                />
              </View>
            ))}
          </View>
        </SectionCard>
      )}

      {/* Xem ảnh minh chứng */}
      <Sheet visible={!!photoUri} title="Ảnh minh chứng" onClose={() => setPhotoUri(null)}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }} resizeMode="contain" />
        ) : null}
      </Sheet>

      {/* Đánh giá Không đạt */}
      <Sheet
        visible={!!failTask}
        title={failTask ? `Không đạt: ${failTask.name}` : ''}
        onClose={() => setFailTask(null)}
        footer={
          <Button loading={busy} onPress={handleSubmitFail}>
            Xác nhận Không đạt
          </Button>
        }
      >
        <TextField
          label="Ghi chú (tuỳ chọn)"
          value={failNote}
          onChangeText={setFailNote}
          multiline
          numberOfLines={3}
          placeholder="Lý do không đạt..."
        />
      </Sheet>

      {/* Áp phạt */}
      <Sheet
        visible={!!penaltyTask}
        title={penaltyTask ? `Phạt vệ sinh: ${penaltyTask.name}` : ''}
        onClose={() => setPenaltyTask(null)}
        footer={
          <Button loading={busy} disabled={loadingStaff} onPress={handleSubmitPenalty}>
            Áp phạt{selectedUserIds.length > 0 ? ` (${selectedUserIds.length} người)` : ''}
          </Button>
        }
      >
        <View className="gap-3">
          <Text variant="bodySmall" className="font-semibold">Chọn nhân viên trong ca</Text>
          {loadingStaff ? (
            <Text variant="bodySmall" tone="muted">Đang tải danh sách...</Text>
          ) : staff.length === 0 ? (
            <Text variant="bodySmall" tone="muted">Không có nhân viên nào được phân công trong ca này.</Text>
          ) : (
            <View className="gap-1">
              {staff.map((s) => {
                const checked = selectedUserIds.includes(s.userId);
                return (
                  <Pressable
                    key={s.userId}
                    onPress={() => toggleStaff(s.userId)}
                    className="flex-row items-center gap-2.5 py-2"
                  >
                    <Icon
                      name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={22}
                      tone={checked ? 'primary' : 'faint'}
                    />
                    <Text variant="bodySmall">
                      {s.isPartialCover ? `${s.fullName} (làm hộ 1 phần ca)` : s.fullName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <TextField
            label="Số tiền phạt (mỗi người)"
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="number-pad"
            placeholder="VD: 50000"
          />

          <TextField
            label="Lý do (tuỳ chọn)"
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={2}
            placeholder="Lý do phạt..."
          />
        </View>
      </Sheet>
    </Screen>
  );
}

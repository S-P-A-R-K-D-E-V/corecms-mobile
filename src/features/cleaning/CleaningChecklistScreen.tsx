import { useState } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard } from 'src/components/shared';
import { Text, Button, Badge, Icon, Pressable } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { showActionSheet, toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { getMyCleaningChecklist, completeCleaningTask, type CleaningPhotoFile } from 'src/api/cleaning';
import type { ICleaningTaskInstance, CleaningTaskStatus } from 'src/types/corecms-api';

// ----------------------------------------------------------------------

const BLOCK_LABEL: Record<string, string> = { Morning: 'Sáng', Afternoon: 'Chiều', Evening: 'Tối' };

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

function TaskRow({ task, onComplete, busy }: {
  task: ICleaningTaskInstance;
  onComplete: (task: ICleaningTaskInstance) => void;
  busy: boolean;
}) {
  const canComplete = task.status === 'Pending' || task.status === 'Done';
  const myPenalties = task.penalties.filter((p) => !p.voidedAt);

  return (
    <View className="py-2.5 gap-1.5">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1">
          <Text className="font-semibold text-[13px]">{task.name}</Text>
          {task.area ? <Text variant="caption" tone="muted">{task.area}</Text> : null}
        </View>
        <Badge tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
      </View>

      {task.status === 'Done' && task.photoObjectKey ? (
        <Text variant="caption" tone="primary">Đã gửi ảnh, đang chờ Quản lý chấm điểm.</Text>
      ) : null}

      {task.status === 'Failed' && task.reviewNote ? (
        <Text variant="caption" tone="error">Ghi chú: {task.reviewNote}</Text>
      ) : null}

      {myPenalties.length > 0 ? (
        <View className="gap-0.5">
          {myPenalties.map((p) => (
            <Text key={p.id} variant="caption" tone="error" className="font-semibold">
              Bị phạt {p.amount.toLocaleString('vi-VN')}đ{p.reason ? ` — ${p.reason}` : ''}
            </Text>
          ))}
        </View>
      ) : null}

      {canComplete ? (
        <Button
          size="sm"
          variant={task.status === 'Done' ? 'outline' : 'solid'}
          icon="camera-outline"
          loading={busy}
          onPress={() => onComplete(task)}
        >
          {task.status === 'Done' ? 'Chụp lại ảnh' : 'Chụp ảnh & hoàn thành'}
        </Button>
      ) : null}
    </View>
  );
}

export function CleaningChecklistScreen() {
  const qc = useQueryClient();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['cleaning', 'my-checklist', date],
    queryFn: () => getMyCleaningChecklist(date),
  });

  const shifts = data ?? [];

  async function pickPhotoAndComplete(task: ICleaningTaskInstance, source: 'camera' | 'library') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error(
        source === 'camera' ? 'Vui lòng cấp quyền camera để chụp ảnh minh chứng.' : 'Vui lòng cấp quyền thư viện ảnh.',
        'Cần cấp quyền'
      );
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    const photo: CleaningPhotoFile = {
      uri: asset.uri,
      name: asset.fileName ?? `cleaning_${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    };

    setBusyTaskId(task.id);
    try {
      await completeCleaningTask(task.id, photo);
      toast.success('Đã ghi nhận hoàn thành, chờ Quản lý chấm điểm.');
      qc.invalidateQueries({ queryKey: ['cleaning', 'my-checklist'] });
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setBusyTaskId(null);
    }
  }

  function handleComplete(task: ICleaningTaskInstance) {
    showActionSheet({
      title: 'Ảnh minh chứng',
      message: 'Chụp ảnh hoặc chọn từ thư viện',
      options: [
        { label: 'Chụp ảnh', icon: 'camera-outline', onPress: () => pickPhotoAndComplete(task, 'camera') },
        { label: 'Chọn từ thư viện', icon: 'image-multiple-outline', onPress: () => pickPhotoAndComplete(task, 'library') },
      ],
    });
  }

  return (
    <Screen scroll refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Checklist vệ sinh" back />

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

      {shifts.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted">Không có checklist vệ sinh cho ca nào trong ngày này.</Text>
        </View>
      ) : (
        shifts.map((shift) => (
          <SectionCard
            key={shift.shiftAssignmentId}
            title={`${shift.shiftName} · ${BLOCK_LABEL[shift.cleaningBlock] ?? shift.cleaningBlock}`}
            icon="broom"
            count={shift.tasks.length}
          >
            <View>
              {shift.tasks.map((task, i) => (
                <View key={task.id}>
                  {i > 0 ? <View className="h-px bg-line/50 dark:bg-line-dark/50" /> : null}
                  <TaskRow task={task} onComplete={handleComplete} busy={busyTaskId === task.id} />
                </View>
              ))}
            </View>
          </SectionCard>
        ))
      )}
    </Screen>
  );
}

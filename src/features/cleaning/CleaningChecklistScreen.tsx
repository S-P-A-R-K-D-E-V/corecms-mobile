import { useState } from 'react';
import { Image, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Badge, Icon, Pressable } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { getMyCleaningChecklist, completeCleaningTask, type CleaningPhotoFile } from 'src/api/cleaning';
import { imagePickerQuality, pickedImage, prepareAttachment } from 'src/features/chat/attachment-prepare';
import type { ICleaningTaskInstance, CleaningTaskStatus } from 'src/types/corecms-api';
import { cleaningVideoFile, firstRejectedCleaningMedia, isAcceptedCleaningMedia } from './cleaning-media';

// ----------------------------------------------------------------------

const MAX_PHOTOS = 5;

const BLOCK_LABEL: Record<string, string> = { Morning: 'Sáng', Afternoon: 'Chiều', Evening: 'Tối' };

/**
 * Ảnh → chuẩn bị như ảnh chat (vẽ lại: bỏ EXIF/GPS, HEIC → JPEG, cạnh dài ≤ 2048px); video giữ nguyên tệp.
 * Tuần tự: mỗi ảnh giải mã tốn nhiều RAM.
 */
async function toCleaningFiles(assets: ImagePicker.ImagePickerAsset[]): Promise<CleaningPhotoFile[]> {
  const files: CleaningPhotoFile[] = [];
  for (const [index, asset] of assets.entries()) {
    if (asset.type === 'video') {
      files.push(cleaningVideoFile(asset, index));
      continue;
    }
    const prepared = await prepareAttachment(pickedImage(asset));
    files.push({ uri: prepared.uri, name: prepared.name, type: prepared.contentType });
  }
  return files;
}

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

function TaskRow({ task, onOpenPicker }: {
  task: ICleaningTaskInstance;
  onOpenPicker: (task: ICleaningTaskInstance) => void;
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

      {task.status === 'Done' && task.photoObjectKeys.length > 0 ? (
        <Text variant="caption" tone="primary">
          Đã gửi {task.photoObjectKeys.length} ảnh, đang chờ Quản lý chấm điểm.
        </Text>
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
          onPress={() => onOpenPicker(task)}
        >
          {task.status === 'Done' ? 'Chụp lại ảnh' : `Chọn ảnh & hoàn thành (tối đa ${MAX_PHOTOS})`}
        </Button>
      ) : null}
    </View>
  );
}

export function CleaningChecklistScreen() {
  const qc = useQueryClient();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [pickerTask, setPickerTask] = useState<ICleaningTaskInstance | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<CleaningPhotoFile[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['cleaning', 'my-checklist', date],
    queryFn: () => getMyCleaningChecklist(date),
  });

  const shifts = data ?? [];

  function openPicker(task: ICleaningTaskInstance) {
    setPickerTask(task);
    setPendingPhotos([]);
  }

  function closePicker() {
    setPickerTask(null);
    setPendingPhotos([]);
  }

  function removePending(index: number) {
    setPendingPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  /** Thêm ảnh/video vừa chọn; tệp server không nhận (vd. HEIC trên bản app chưa có bộ nén) thì bỏ và báo rõ. */
  async function addAssets(assets: ImagePicker.ImagePickerAsset[]) {
    setPreparing(true);
    try {
      const files = await toCleaningFiles(assets);
      const rejected = firstRejectedCleaningMedia(files);
      if (rejected) {
        toast.error(
          `“${rejected.name}” không gửi được — chỉ nhận ảnh JPG, PNG, WEBP, GIF và video MP4, MOV, WEBM, 3GP. Hãy cập nhật app hoặc chọn ảnh khác.`,
          'Không thêm được tệp'
        );
      }
      const accepted = files.filter((f) => isAcceptedCleaningMedia(f.type));
      setPendingPhotos((prev) => [...prev, ...accepted].slice(0, MAX_PHOTOS));
    } catch {
      toast.error('Không đọc được ảnh đã chọn. Vui lòng chọn lại.');
    } finally {
      setPreparing(false);
    }
  }

  async function addFromCamera() {
    if (pendingPhotos.length >= MAX_PHOTOS) {
      toast.warning(`Tối đa ${MAX_PHOTOS} ảnh`);
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast.error('Vui lòng cấp quyền camera để chụp ảnh minh chứng.', 'Cần cấp quyền');
      return;
    }
    // Có bộ nén → lấy bản gốc rồi vẽ lại một lần (bỏ EXIF/GPS); bản app cũ chưa có → để camera nén.
    const result = await ImagePicker.launchCameraAsync({ quality: imagePickerQuality(0.7), exif: false });
    if (result.canceled || result.assets.length === 0) return;
    await addAssets(result.assets.slice(0, 1));
  }

  async function addFromLibrary() {
    const remaining = MAX_PHOTOS - pendingPhotos.length;
    if (remaining <= 0) {
      toast.warning(`Tối đa ${MAX_PHOTOS} ảnh`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error('Vui lòng cấp quyền thư viện ảnh.', 'Cần cấp quyền');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: imagePickerQuality(0.7),
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      // iOS mặc định trả nguyên ảnh HEIC (bỏ qua quality) → server không nhận; xin bản JPEG tương thích.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      exif: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    await addAssets(result.assets.slice(0, remaining));
  }

  async function handleSubmit() {
    if (!pickerTask || pendingPhotos.length === 0) return;
    setSubmitting(true);
    try {
      await completeCleaningTask(pickerTask.id, pendingPhotos);
      toast.success('Đã ghi nhận hoàn thành, chờ Quản lý chấm điểm.');
      closePicker();
      qc.invalidateQueries({ queryKey: ['cleaning', 'my-checklist'] });
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
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

      {isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">
            Không tải được checklist vệ sinh: {extractApiError(error)}
          </Text>
          <Button size="sm" variant="outline" onPress={() => refetch()}>Thử lại</Button>
        </View>
      ) : shifts.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted">Không có checklist vệ sinh cho ca nào trong ngày này.</Text>
        </View>
      ) : (
        shifts.map((shift) => (
          // Backend giờ có thể trả >1 entry cho cùng 1 shiftAssignmentId (mỗi
          // CleaningBlock liên kết với ca là 1 entry riêng) — dùng key ghép
          // shiftAssignmentId + cleaningBlock để tránh trùng key React và mất entry.
          <SectionCard
            key={`${shift.shiftAssignmentId}-${shift.cleaningBlock}`}
            title={`${shift.shiftName} · ${BLOCK_LABEL[shift.cleaningBlock] ?? shift.cleaningBlock}`}
            icon="broom"
            count={shift.tasks.length}
          >
            <View>
              {shift.tasks.map((task, i) => (
                <View key={task.id}>
                  {i > 0 ? <View className="h-px bg-line/50 dark:bg-line-dark/50" /> : null}
                  <TaskRow task={task} onOpenPicker={openPicker} />
                </View>
              ))}
            </View>
          </SectionCard>
        ))
      )}

      <Sheet
        visible={!!pickerTask}
        title={pickerTask ? `Ảnh minh chứng: ${pickerTask.name}` : ''}
        onClose={closePicker}
        footer={
          <Button loading={submitting} disabled={pendingPhotos.length === 0 || preparing} onPress={handleSubmit}>
            Hoàn thành ({pendingPhotos.length} ảnh)
          </Button>
        }
      >
        <View className="gap-3">
          {pendingPhotos.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {pendingPhotos.map((photo, index) => {
                const isVideo = photo.type.startsWith('video/');
                return (
                  <View key={photo.uri + index} className="relative">
                    {isVideo ? (
                      <View
                        style={{ width: 72, height: 72, borderRadius: 8 }}
                        className="items-center justify-center bg-bg dark:bg-surface-dark"
                      >
                        <Icon name="play-circle-outline" size={28} tone="muted" />
                      </View>
                    ) : (
                      <Image source={{ uri: photo.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />
                    )}
                    <Pressable
                      onPress={() => removePending(index)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-error items-center justify-center"
                    >
                      <Icon name="close" size={12} tone="inverse" />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text variant="bodySmall" tone="muted">Chưa chọn ảnh/video nào — chụp ảnh hoặc chọn từ thư viện bên dưới.</Text>
          )}

          {pendingPhotos.length < MAX_PHOTOS ? (
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button variant="outline" icon="camera-outline" disabled={preparing || submitting} onPress={addFromCamera}>
                  Chụp ảnh
                </Button>
              </View>
              <View className="flex-1">
                <Button
                  variant="outline"
                  icon="image-multiple-outline"
                  loading={preparing}
                  disabled={preparing || submitting}
                  onPress={addFromLibrary}
                >
                  Thư viện (ảnh/video)
                </Button>
              </View>
            </View>
          ) : (
            <Text variant="caption" tone="faint">Đã đạt tối đa {MAX_PHOTOS} file.</Text>
          )}
        </View>
      </Sheet>
    </Screen>
  );
}

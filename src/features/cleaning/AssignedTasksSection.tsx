import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Badge, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { getMyWorkTasks, submitWorkTask, uploadWorkTaskPhoto } from 'src/api/hr';
import { WORK_TASK_STATUS_LABEL, type IWorkTask, type WorkTaskStatus } from 'src/types/hr';
import { captureInspectionPhoto, discardInspectionPhoto } from 'src/features/inspection/inspection-photos';
import type { DraftPhoto } from 'src/features/inspection/inspection-draft';
import { PhotoRules, PhotoStrip } from 'src/features/inspection/inspection-ui';

// ----------------------------------------------------------------------
// Việc giao riêng cho tôi (Việc được giao → cho một người): nộp kèm ảnh nghiệm thu chụp tại chỗ, quản lý duyệt trên web.
// Nằm dưới việc theo ca trong màn Việc của tôi.
// ----------------------------------------------------------------------

const MAX_PHOTOS = 5;

const STATUS_TONE: Record<WorkTaskStatus, 'info' | 'warning' | 'success' | 'error' | 'neutral'> = {
  Assigned: 'info',
  Submitted: 'warning',
  Approved: 'success',
  Rejected: 'error',
  Cancelled: 'neutral',
};

function TaskCard({ task, onSubmit }: { task: IWorkTask; onSubmit: () => void }) {
  const canSubmit = task.status === 'Assigned' || task.status === 'Rejected';
  return (
    <SectionCard
      title={task.title}
      right={<Badge tone={STATUS_TONE[task.status]}>{WORK_TASK_STATUS_LABEL[task.status]}</Badge>}
      bodyClassName="pt-0 gap-1.5"
    >
      {task.description ? <Text variant="bodySmall">{task.description}</Text> : null}
      {task.dueAt ? (
        <Text variant="caption" tone="muted">Hạn {dayjs(task.dueAt).format('HH:mm DD/MM')}</Text>
      ) : null}
      {task.reviewNote ? (
        <Text variant="caption" tone={task.status === 'Rejected' ? 'warning' : 'muted'} className="font-semibold">
          {task.status === 'Rejected' ? 'Trả lại: ' : 'Nhận xét: '}
          {task.reviewNote}
        </Text>
      ) : null}
      {task.photos.length > 0 ? <PhotoStrip server={task.photos.map((p) => ({ id: p.id, url: p.url, kind: 'Fault' as const, uploadedAt: p.uploadedAt }))} /> : null}
      {canSubmit ? (
        <Button size="sm" icon="upload-outline" onPress={onSubmit}>
          {task.status === 'Rejected' ? 'Nộp lại' : 'Nộp'}
        </Button>
      ) : null}
    </SectionCard>
  );
}

function SubmitSheet({ task, onClose, onDone }: { task: IWorkTask | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Phiếu sáng kiến cũ (tạo từ app bản trước) không bắt buộc ảnh.
  const needPhoto = task?.group !== 'Initiative' && (task?.photos.length ?? 0) === 0 && photos.length === 0;

  function close() {
    photos.forEach((p) => void discardInspectionPhoto(p.uri));
    setPhotos([]);
    setNote('');
    onClose();
  }

  async function capture() {
    if (!task) return;
    const photo = await captureInspectionPhoto(task.id);
    if (photo) setPhotos((prev) => [...prev, photo].slice(0, MAX_PHOTOS));
  }

  async function submit() {
    if (!task || needPhoto) return;
    try {
      const keys: string[] = [];
      for (const [i, p] of photos.entries()) {
        setBusy(`Đang tải ảnh ${i + 1}/${photos.length}…`);
        keys.push(p.key ?? (await uploadWorkTaskPhoto(task.id, p)));
        setPhotos((prev) => prev.map((x, j) => (j === i ? { ...x, key: keys[i] } : x)));
      }
      setBusy('Đang nộp…');
      await submitWorkTask(task.id, note.trim() || null, keys);
      photos.forEach((p) => void discardInspectionPhoto(p.uri));
      setPhotos([]);
      setNote('');
      toast.success('Đã nộp — chờ quản lý duyệt.');
      onDone();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa nộp được');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      visible={!!task}
      title={`Nộp: ${task?.title ?? ''}`}
      onClose={busy ? () => {} : close}
      footer={
        <Button loading={!!busy} disabled={!!busy || needPhoto} onPress={submit}>
          {needPhoto ? 'Cần ảnh nghiệm thu' : 'Nộp'}
        </Button>
      }
    >
      <View className="gap-3">
        <PhotoRules />
        <TextField placeholder="Ghi chú (không bắt buộc)" value={note} onChangeText={setNote} multiline />
        <PhotoStrip
          server={[]}
          local={photos}
          onRemoveLocal={busy ? undefined : (i) => {
            const p = photos[i];
            if (p) void discardInspectionPhoto(p.uri);
            setPhotos((prev) => prev.filter((_, j) => j !== i));
          }}
        />
        {photos.length < MAX_PHOTOS ? (
          <Button variant="outline" icon="camera-outline" disabled={!!busy} onPress={capture}>
            Chụp ảnh nghiệm thu
          </Button>
        ) : null}
        {(task?.photos.length ?? 0) > 0 ? (
          <Text variant="caption" tone="muted">Đã có {task?.photos.length} ảnh từ lần nộp trước.</Text>
        ) : null}
        {busy ? <Text variant="caption" tone="primary">{busy}</Text> : null}
      </View>
    </Sheet>
  );
}

export function AssignedTasksSection() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['hr', 'tasks'], queryFn: () => getMyWorkTasks() });
  const [submitting, setSubmitting] = useState<IWorkTask | null>(null);
  const list = query.data ?? [];

  return (
    <View className="gap-3 mt-2">
      <Text variant="subtitle">Việc giao riêng cho tôi</Text>
      {query.isError ? (
        <View className="py-6 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được việc giao riêng: {extractApiError(query.error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
        </View>
      ) : !query.isLoading && list.length === 0 ? (
        <View className="py-6 items-center">
          <Text variant="bodySmall" tone="muted">Không có việc nào được giao riêng cho bạn.</Text>
        </View>
      ) : (
        list.map((t) => <TaskCard key={t.id} task={t} onSubmit={() => setSubmitting(t)} />)
      )}

      <SubmitSheet
        task={submitting}
        onClose={() => setSubmitting(null)}
        onDone={() => {
          setSubmitting(null);
          qc.invalidateQueries({ queryKey: ['hr', 'tasks'] });
        }}
      />
    </View>
  );
}

import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Badge, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { createInitiative, getMyWorkTasks, submitWorkTask, uploadWorkTaskPhoto } from 'src/api/hr';
import { WORK_TASK_GROUP_LABEL, WORK_TASK_STATUS_LABEL, type IWorkTask, type WorkTaskStatus } from 'src/types/hr';
import { captureInspectionPhoto, discardInspectionPhoto } from 'src/features/inspection/inspection-photos';
import type { DraftPhoto } from 'src/features/inspection/inspection-draft';
import { PhotoRules, PhotoStrip } from 'src/features/inspection/inspection-ui';

// ----------------------------------------------------------------------
// Nhiệm vụ trong giờ ca (Quy chế Điều 14a) — nộp kèm ảnh nghiệm thu; phiếu đề xuất sáng kiến (+1 điểm mỗi phiếu được
// duyệt, tối đa 2; +3 nếu được chọn triển khai). Ảnh chụp tại chỗ, chỉ dùng nội bộ.
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
      <View className="flex-row gap-1.5 flex-wrap">
        <Badge tone="neutral">{WORK_TASK_GROUP_LABEL[task.group]}</Badge>
        {task.implemented ? <Badge tone="primary">Được chọn triển khai</Badge> : null}
      </View>
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
          {task.group === 'Initiative' ? 'Gửi phiếu' : task.status === 'Rejected' ? 'Nộp lại' : 'Nộp'}
        </Button>
      ) : null}
    </SectionCard>
  );
}

function SubmitSheet({ task, onClose, onDone }: { task: IWorkTask | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const isInitiative = task?.group === 'Initiative';
  const needPhoto = !isInitiative && (task?.photos.length ?? 0) === 0 && photos.length === 0;

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
      toast.success(isInitiative ? 'Đã gửi phiếu sáng kiến.' : 'Đã nộp — chờ quản lý duyệt.');
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
      title={isInitiative ? 'Gửi phiếu sáng kiến' : `Nộp: ${task?.title ?? ''}`}
      onClose={busy ? () => {} : close}
      footer={
        <Button loading={!!busy} disabled={!!busy || needPhoto} onPress={submit}>
          {needPhoto ? 'Cần ảnh nghiệm thu' : isInitiative ? 'Gửi phiếu' : 'Nộp'}
        </Button>
      }
    >
      <View className="gap-3">
        {!isInitiative ? <PhotoRules /> : null}
        <TextField
          placeholder={isInitiative ? 'Ghi chú thêm (không bắt buộc)' : 'Ghi chú: link bài, số đơn… (không bắt buộc)'}
          value={note}
          onChangeText={setNote}
          multiline
        />
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
            {isInitiative ? 'Chụp ảnh minh hoạ (không bắt buộc)' : 'Chụp ảnh nghiệm thu'}
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

function InitiativeSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (t: IWorkTask) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const task = await createInitiative(title.trim(), description.trim());
      setTitle('');
      setDescription('');
      onCreated(task);
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa tạo được phiếu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Phiếu đề xuất sáng kiến"
      onClose={busy ? () => {} : onClose}
      footer={
        <Button loading={busy} disabled={busy || !title.trim() || !description.trim()} onPress={create}>
          Tiếp tục
        </Button>
      }
    >
      <View className="gap-3">
        <TextField label="Tên chương trình / sự kiện" value={title} onChangeText={setTitle} />
        <TextField
          label="Nội dung"
          placeholder="Mục tiêu, sản phẩm, cơ chế (combo, quà, giảm giá), thời gian, trang trí, chi phí, doanh thu dự kiến"
          value={description}
          onChangeText={setDescription}
          multiline
        />
      </View>
    </Sheet>
  );
}

export function HrTasksScreen() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['hr', 'tasks'], queryFn: () => getMyWorkTasks() });
  const [submitting, setSubmitting] = useState<IWorkTask | null>(null);
  const [newIdea, setNewIdea] = useState(false);
  const list = query.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'tasks'] });

  return (
    <Screen scroll refreshing={query.isFetching} onRefresh={query.refetch}>
      <AppHeader title="Nhiệm vụ & sáng kiến" back />
      <Text variant="caption" tone="muted">
        Nhiệm vụ làm trong giờ ca, nộp kèm ảnh nghiệm thu. Điểm nhiệm vụ tính theo tỷ lệ được duyệt đúng hạn.
      </Text>
      <Button variant="soft" icon="lightbulb-on-outline" onPress={() => setNewIdea(true)}>
        Đề xuất sáng kiến
      </Button>

      {query.isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được nhiệm vụ: {extractApiError(query.error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
        </View>
      ) : !query.isLoading && list.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted">Chưa có nhiệm vụ nào.</Text>
        </View>
      ) : (
        list.map((t) => <TaskCard key={t.id} task={t} onSubmit={() => setSubmitting(t)} />)
      )}

      <SubmitSheet
        task={submitting}
        onClose={() => setSubmitting(null)}
        onDone={() => {
          setSubmitting(null);
          refresh();
        }}
      />
      <InitiativeSheet
        visible={newIdea}
        onClose={() => setNewIdea(false)}
        onCreated={(t) => {
          setNewIdea(false);
          refresh();
          setSubmitting(t);
        }}
      />
    </Screen>
  );
}

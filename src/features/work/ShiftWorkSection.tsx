import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Badge, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { completeShiftWork, getMyShiftWork, uploadShiftWorkPhoto } from 'src/api/inspection';
import {
  INSPECTION_OUTCOME_LABEL,
  type IShiftWorkItem,
  type IShiftWorkShift,
  type InspectionOutcome,
} from 'src/types/inspection';
import type { DraftPhoto } from 'src/features/inspection/inspection-draft';
import { captureInspectionPhoto, discardInspectionPhoto } from 'src/features/inspection/inspection-photos';
import { PhotoRules, PhotoStrip, toStripPhotos } from 'src/features/inspection/inspection-ui';

// ----------------------------------------------------------------------
// Việc trong ca: hạng mục bảng mỗi ca có cờ "nhân viên tự làm" của các ca của tôi trong ngày. Ai trong ca làm xong thì
// chụp ảnh tại chỗ (≤ 5) và gửi; trưởng ca / quản lý chấm Đạt / Không đạt khi kiểm ca. Chưa chấm thì làm lại được.
// ----------------------------------------------------------------------

export const MAX_WORK_PHOTOS = 5;

export const shiftWorkKey = (date: string) => ['shift-work', 'mine', date] as const;

const OUTCOME_TONE: Record<InspectionOutcome, 'success' | 'error' | 'neutral'> = {
  Pass: 'success',
  Fail: 'error',
  NotApplicable: 'neutral',
};

/** Còn làm / làm lại được: ca chưa chấm hạng mục này và không phải ngày sau. */
export function canDoItem(item: IShiftWorkItem, date: string, today: string): boolean {
  return item.outcome == null && date <= today;
}

function ItemRow({ item, canDo, onDo }: { item: IShiftWorkItem; canDo: boolean; onDo: () => void }) {
  const c = item.completion;
  return (
    <View className="py-2.5 gap-1.5">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text className="font-semibold text-[13px]">
            {item.code} · {item.title}
          </Text>
          <Text variant="caption" tone="muted">Đạt khi: {item.passCriteria}</Text>
          {item.zones.length > 0 ? <Text variant="caption" tone="faint">Khu {item.zones.join(', ')}</Text> : null}
        </View>
        {item.outcome ? (
          <Badge tone={OUTCOME_TONE[item.outcome]}>{INSPECTION_OUTCOME_LABEL[item.outcome]}</Badge>
        ) : c ? (
          <Badge tone="info">Đã làm</Badge>
        ) : (
          <Badge tone="neutral">Chưa làm</Badge>
        )}
      </View>
      {c ? (
        <View className="gap-1">
          <Text variant="caption" tone="primary">
            Đã làm: {c.completedByName} lúc {dayjs(c.completedAt).format('HH:mm DD/MM')}
          </Text>
          {c.note ? <Text variant="caption" tone="muted">{c.note}</Text> : null}
          <PhotoStrip server={toStripPhotos(c.photos)} />
        </View>
      ) : null}
      {canDo ? (
        <Button size="sm" variant={c ? 'outline' : 'solid'} icon="camera-outline" onPress={onDo}>
          {c ? 'Làm lại' : 'Đã làm'}
        </Button>
      ) : null}
    </View>
  );
}

function DoneSheet({
  target,
  onClose,
  onDone,
}: {
  target: { shift: IShiftWorkShift; item: IShiftWorkItem } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const needPhoto = !!target?.item.requiresPhoto && photos.length === 0;

  function close() {
    photos.forEach((p) => void discardInspectionPhoto(p.uri));
    setPhotos([]);
    setNote('');
    onClose();
  }

  async function capture() {
    if (!target) return;
    const photo = await captureInspectionPhoto(`work-${target.item.itemId}`);
    if (photo) setPhotos((prev) => [...prev, photo].slice(0, MAX_WORK_PHOTOS));
  }

  async function submit() {
    if (!target || needPhoto) return;
    const { shift, item } = target;
    try {
      const keys: string[] = [];
      for (const [i, p] of photos.entries()) {
        setBusy(`Đang tải ảnh ${i + 1}/${photos.length}…`);
        keys.push(p.key ?? (await uploadShiftWorkPhoto(shift.shiftScheduleId, shift.date, p)));
        // Giữ key đã có để bấm lại không tải lại ảnh đã lên.
        setPhotos((prev) => prev.map((x, j) => (j === i ? { ...x, key: keys[i] } : x)));
      }
      setBusy('Đang gửi…');
      await completeShiftWork({
        date: shift.date,
        shiftScheduleId: shift.shiftScheduleId,
        itemId: item.itemId,
        note: note.trim() || null,
        photoKeys: keys,
      });
      photos.forEach((p) => void discardInspectionPhoto(p.uri));
      setPhotos([]);
      setNote('');
      toast.success('Đã ghi nhận — chờ trưởng ca / quản lý kiểm.');
      onDone();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa gửi được');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      visible={!!target}
      title={target ? `Đã làm: ${target.item.title}` : ''}
      onClose={busy ? () => {} : close}
      footer={
        <Button loading={!!busy} disabled={!!busy || needPhoto} onPress={submit}>
          {needPhoto ? 'Cần ảnh sau khi làm' : 'Gửi'}
        </Button>
      }
    >
      <View className="gap-3">
        <PhotoRules />
        {target ? <Text variant="caption" tone="muted">Đạt khi: {target.item.passCriteria}</Text> : null}
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
        {photos.length < MAX_WORK_PHOTOS ? (
          <Button variant="outline" icon="camera-outline" disabled={!!busy} onPress={capture}>
            {target?.item.requiresPhoto ? 'Chụp ảnh (bắt buộc)' : 'Chụp ảnh'}
          </Button>
        ) : null}
        {target?.item.completion ? (
          <Text variant="caption" tone="muted">Gửi lại sẽ thay ảnh và ghi chú lần trước.</Text>
        ) : null}
        {busy ? <Text variant="caption" tone="primary">{busy}</Text> : null}
      </View>
    </Sheet>
  );
}

export function ShiftWorkSection({ date, enabled = true }: { date: string; enabled?: boolean }) {
  const qc = useQueryClient();
  const today = dayjs().format('YYYY-MM-DD');
  const [target, setTarget] = useState<{ shift: IShiftWorkShift; item: IShiftWorkItem } | null>(null);
  const query = useQuery({ queryKey: shiftWorkKey(date), queryFn: () => getMyShiftWork(date), enabled });

  if (!enabled) return null;
  const shifts = (query.data ?? []).filter((s) => s.items.length > 0);

  return (
    <View className="gap-3">
      {query.isError ? (
        <View className="py-6 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được việc trong ca: {extractApiError(query.error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
        </View>
      ) : !query.isLoading && shifts.length === 0 ? (
        <View className="py-6 items-center">
          <Text variant="bodySmall" tone="muted">Không có việc nào trong ca của bạn ngày này.</Text>
        </View>
      ) : (
        shifts.map((shift) => {
          const done = shift.items.filter((i) => i.completion || i.outcome).length;
          return (
            <SectionCard
              key={shift.shiftScheduleId}
              title={`${shift.shiftName} ${shift.startTime}–${shift.endTime}`}
              icon="clipboard-check-outline"
              right={
                <Text variant="caption" tone={done === shift.items.length ? 'success' : 'muted'} className="font-semibold">
                  {done}/{shift.items.length} xong
                </Text>
              }
            >
              <View>
                {shift.items.map((item, i) => (
                  <View key={item.itemId}>
                    {i > 0 ? <View className="h-px bg-line/50 dark:bg-line-dark/50" /> : null}
                    <ItemRow item={item} canDo={canDoItem(item, shift.date, today)} onDo={() => setTarget({ shift, item })} />
                  </View>
                ))}
              </View>
            </SectionCard>
          );
        })
      )}

      <DoneSheet
        target={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          setTarget(null);
          qc.invalidateQueries({ queryKey: ['shift-work'] });
        }}
      />
    </View>
  );
}

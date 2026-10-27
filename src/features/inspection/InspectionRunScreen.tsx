import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard } from 'src/components/shared';
import { Text, Button, Badge, TextField, Spinner } from 'src/components/ui';
import { toast, confirm } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { prefs } from 'src/services/storage';
import { useAuthContext } from 'src/auth/auth-context';
import { getInspection, saveInspectionResults, submitInspection, uploadInspectionPhoto } from 'src/api/inspection';
import { INSPECTION_TYPE_LABEL, type IInspection, type InspectionOutcome } from 'src/types/inspection';
import {
  buildRows,
  draftKey,
  hasUnsavedChanges,
  needsPhoto,
  parseDraft,
  pendingPhotos,
  photosLeft,
  seedEntries,
  serializeDraft,
  submitBlockers,
  toResultInputs,
  withPhotoKey,
  type DraftEntry,
  type InspectionRow,
} from './inspection-draft';
import { captureInspectionPhoto, discardInspectionPhoto, discardInspectionPhotos } from './inspection-photos';
import { LevelBadge, OutcomeButtons, PhotoRules, PhotoStrip } from './inspection-ui';

// ----------------------------------------------------------------------
// Chạy checklist của một lượt kiểm. Mỗi lần chấm là ghi bản nháp xuống máy (inspection-draft); "Lưu" / "Nộp" mới
// gửi lên: tải hết ảnh trên máy (presigned, có thử lại) → lưu kết quả kèm key ảnh → nộp. Ảnh chưa tải lên xong thì
// chưa lưu kết quả, nên không có lượt nộp thiếu ảnh. Đã nộp / không phải người kiểm thì chỉ xem.
// ----------------------------------------------------------------------

const fmtTime = (iso: string | null | undefined) => (iso ? dayjs(iso).format('HH:mm') : '');

function RowCard({
  row,
  entry,
  editable,
  staffName,
  onOutcome,
  onNote,
  onCapture,
  onRemovePhoto,
}: {
  row: InspectionRow;
  entry: DraftEntry | undefined;
  editable: boolean;
  staffName: (id: string | null) => string | null;
  onOutcome: (o: InspectionOutcome) => void;
  onNote: (note: string) => void;
  onCapture: () => void;
  onRemovePhoto: (index: number) => void;
}) {
  const { item, server } = row;
  const failed = entry?.outcome === 'Fail';
  const missingPhoto = needsPhoto(row, entry);
  const serverPhotos = server?.photos.filter((p) => p.kind === 'Fault') ?? [];
  // Thông tin lỗi theo server chỉ đúng khi trên máy chưa đổi kết quả.
  const serverFault = server?.outcome === 'Fail' && entry?.outcome === 'Fail' ? server : null;

  return (
    <View className="py-3 gap-2">
      <View className="flex-row items-start gap-2">
        <LevelBadge level={item.level} />
        <View className="flex-1">
          <Text className="font-semibold text-[14px]">
            {item.code} · {item.title}
          </Text>
          <Text variant="caption" tone="muted">Đạt khi: {item.passCriteria}</Text>
          {item.zones.length > 0 ? <Text variant="caption" tone="faint">Khu {item.zones.join(', ')}</Text> : null}
          {row.observedStaffId ? (
            <Text variant="caption" tone="primary" className="font-semibold">
              {row.observedStaffName ?? 'Nhân viên'} · Lượt {row.observationIndex + 1}
            </Text>
          ) : null}
        </View>
      </View>

      <OutcomeButtons value={entry?.outcome ?? null} disabled={!editable} onChange={onOutcome} />

      {failed ? (
        <View className="gap-2">
          {editable ? (
            <TextField placeholder="Ghi chú lỗi (không bắt buộc)" value={entry?.note ?? ''} onChangeText={onNote} multiline />
          ) : entry?.note ? (
            <Text variant="bodySmall">Ghi chú: {entry.note}</Text>
          ) : null}
          <PhotoStrip server={serverPhotos} local={entry?.photos} onRemoveLocal={editable ? onRemovePhoto : undefined} />
          {editable && photosLeft(row, entry) > 0 ? (
            <Button size="sm" variant="outline" action={missingPhoto ? 'error' : 'primary'} icon="camera-outline" onPress={onCapture}>
              {missingPhoto ? 'Chụp ảnh lỗi (bắt buộc)' : 'Chụp thêm ảnh'}
            </Button>
          ) : null}
          {serverFault ? (
            <View className="gap-0.5">
              {serverFault.responsibleStaffId ? (
                <Text variant="caption" tone="muted">
                  Người phụ trách: {staffName(serverFault.responsibleStaffId) ?? '—'}
                  {serverFault.zoneUnassigned ? ' (khu chưa phân → trưởng ca)' : ''}
                </Text>
              ) : null}
              {serverFault.fixedAt ? (
                <Text variant="caption" tone="success">Đã sửa lúc {fmtTime(serverFault.fixedAt)}</Text>
              ) : serverFault.fixDeadlineAt ? (
                <Text variant="caption" tone={serverFault.isOverdue ? 'error' : 'warning'}>
                  {serverFault.isOverdue ? 'Quá hạn sửa' : 'Hạn sửa'} {fmtTime(serverFault.fixDeadlineAt)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function InspectionRunScreen({ id }: { id: string }) {
  const qc = useQueryClient();
  const { user } = useAuthContext();
  const [entries, setEntries] = useState<Record<string, DraftEntry>>({});
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Bản mới nhất cho các bước async (ảnh tải xong lần lượt ghi key vào đây rồi mới setState).
  const latest = useRef(entries);
  latest.current = entries;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['inspection', 'detail', id],
    queryFn: () => getInspection(id),
  });

  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);
  const editable = !!data && data.summary.status === 'Draft' && data.summary.inspectorId === user?.id;
  const staffNames = useMemo(() => new Map((data?.zoneOwners.staff ?? []).map((s) => [s.staffId, s.name])), [data]);
  const staffName = (sid: string | null) => (sid ? staffNames.get(sid) ?? null : null);

  // Nạp bản nháp trên máy một lần khi có dữ liệu lượt kiểm.
  useEffect(() => {
    if (!data || hydrated) return;
    let cancelled = false;
    prefs
      .get(draftKey(id))
      .catch(() => null)
      .then((raw) => {
        if (cancelled) return;
        setEntries(seedEntries(rows, editable ? parseDraft(raw, id) : null));
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [data, hydrated, rows, editable, id]);

  function persist(next: Record<string, DraftEntry>) {
    latest.current = next;
    setEntries(next);
    prefs.set(draftKey(id), serializeDraft(id, next, Date.now())).catch(() => {});
  }

  function update(key: string, patch: Partial<DraftEntry>) {
    const prev = latest.current[key] ?? { outcome: null, note: '', photos: [] };
    persist({ ...latest.current, [key]: { ...prev, ...patch } });
  }

  function setOutcome(row: InspectionRow, outcome: InspectionOutcome) {
    const prev = latest.current[row.key];
    // Bỏ "Không đạt" → ảnh lỗi trên máy không còn dùng.
    if (outcome !== 'Fail' && prev?.photos.length) prev.photos.forEach((p) => void discardInspectionPhoto(p.uri));
    update(row.key, { outcome, photos: outcome === 'Fail' ? prev?.photos ?? [] : [] });
  }

  async function capture(row: InspectionRow) {
    if (photosLeft(row, latest.current[row.key]) <= 0) return;
    const photo = await captureInspectionPhoto(id);
    if (!photo) return;
    const prev = latest.current[row.key] ?? { outcome: 'Fail' as const, note: '', photos: [] };
    update(row.key, { photos: [...prev.photos, photo] });
  }

  function removePhoto(row: InspectionRow, index: number) {
    const prev = latest.current[row.key];
    if (!prev) return;
    const photo = prev.photos[index];
    if (photo) void discardInspectionPhoto(photo.uri);
    update(row.key, { photos: prev.photos.filter((_, i) => i !== index) });
  }

  /** Tải ảnh còn trên máy rồi lưu kết quả; thành công thì bỏ bản nháp, lấy lại theo server. */
  async function pushToServer(): Promise<IInspection | null> {
    const pending = pendingPhotos(latest.current);
    for (const [i, p] of pending.entries()) {
      setBusy(`Đang tải ảnh ${i + 1}/${pending.length}…`);
      const objectKey = await uploadInspectionPhoto(id, p.photo);
      persist(withPhotoKey(latest.current, p.key, p.index, objectKey));
    }
    const inputs = toResultInputs(rows, latest.current);
    if (inputs.length === 0) return data ?? null;
    setBusy('Đang lưu kết quả…');
    const saved = await saveInspectionResults(id, inputs);
    await prefs.remove(draftKey(id)).catch(() => {});
    await discardInspectionPhotos(id);
    qc.setQueryData(['inspection', 'detail', id], saved);
    const fresh = seedEntries(buildRows(saved), null);
    latest.current = fresh;
    setEntries(fresh);
    return saved;
  }

  async function handleSave() {
    try {
      await pushToServer();
      toast.success('Đã lưu kết quả.');
      qc.invalidateQueries({ queryKey: ['inspection', 'shifts'] });
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa lưu được — kết quả vẫn giữ trên máy');
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit() {
    const blockers = submitBlockers(rows, latest.current);
    if (!blockers.ready) {
      toast.warning(
        blockers.unanswered > 0
          ? `Còn ${blockers.unanswered} mục chưa chấm.`
          : `Còn ${blockers.missingPhoto} lỗi chưa có ảnh.`,
        'Chưa nộp được'
      );
      return;
    }
    const ok = await confirm({
      title: 'Nộp lượt kiểm?',
      message: 'Lỗi sẽ được báo cho người phụ trách. Sau khi nộp chỉ quản lý sửa được kết quả.',
      confirmText: 'Nộp',
    });
    if (!ok) return;
    try {
      await pushToServer();
      setBusy('Đang nộp…');
      const submitted = await submitInspection(id);
      qc.setQueryData(['inspection', 'detail', id], submitted);
      qc.invalidateQueries({ queryKey: ['inspection'] });
      toast.success(
        submitted.summary.failCount > 0
          ? `Đã nộp — ${submitted.summary.failCount} lỗi đã báo cho người phụ trách.`
          : 'Đã nộp — tất cả đạt.'
      );
      router.back();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa nộp được — kết quả vẫn giữ trên máy');
    } finally {
      setBusy(null);
    }
  }

  // Nhóm theo nhóm hạng mục của bảng kiểm (giữ thứ tự).
  const groups = useMemo(() => {
    const out: { name: string; rows: InspectionRow[] }[] = [];
    for (const row of rows) {
      const name = row.item.groupName || 'Hạng mục';
      const last = out[out.length - 1];
      if (last && last.name === name) last.rows.push(row);
      else out.push({ name, rows: [row] });
    }
    return out;
  }, [rows]);

  const s = data?.summary;
  const blockers = submitBlockers(rows, entries);
  const answered = rows.length - blockers.unanswered;
  const unsaved = hydrated && editable && hasUnsavedChanges(rows, entries);

  return (
    <Screen scroll refreshing={false} onRefresh={editable ? undefined : refetch}>
      <AppHeader
        title={s ? INSPECTION_TYPE_LABEL[s.type] + (s.isSpotCheck ? ' · đột xuất' : '') : 'Lượt kiểm'}
        subtitle={s ? `${s.shiftName} ${s.startTime}–${s.endTime} · ${dayjs(s.date).format('DD/MM')}` : undefined}
        back
      />

      {isLoading || (data && !hydrated) ? (
        <View className="py-10 items-center">
          <Spinner />
        </View>
      ) : isError || !data || !s ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được lượt kiểm: {extractApiError(error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => refetch()}>Thử lại</Button>
        </View>
      ) : (
        <>
          <View className="flex-row flex-wrap items-center gap-2">
            {s.status === 'Submitted' ? <Badge tone="success">Đã nộp</Badge> : <Badge tone="warning">Đang kiểm</Badge>}
            <Text variant="caption" tone="muted">Người kiểm: {s.inspectorName}</Text>
            {data.zoneOwners.shiftLeadId ? (
              <Text variant="caption" tone="muted">· Trưởng ca: {staffName(data.zoneOwners.shiftLeadId) ?? '—'}</Text>
            ) : null}
          </View>

          {editable ? <PhotoRules /> : null}
          {!editable && s.status === 'Draft' ? (
            <Text variant="caption" tone="muted">Lượt này do {s.inspectorName} kiểm — bạn chỉ xem.</Text>
          ) : null}

          {groups.map((g) => (
            <SectionCard key={g.name} title={g.name} count={g.rows.length} bodyClassName="pt-0">
              {g.rows.map((row, i) => (
                <View key={row.key}>
                  {i > 0 ? <View className="h-px bg-line/50 dark:bg-line-dark/50" /> : null}
                  <RowCard
                    row={row}
                    entry={entries[row.key]}
                    editable={editable && !busy}
                    staffName={staffName}
                    onOutcome={(o) => setOutcome(row, o)}
                    onNote={(note) => update(row.key, { note })}
                    onCapture={() => void capture(row)}
                    onRemovePhoto={(index) => removePhoto(row, index)}
                  />
                </View>
              ))}
            </SectionCard>
          ))}

          {editable ? (
            <View className="gap-2 pb-4">
              <Text variant="caption" tone={blockers.ready ? 'success' : 'muted'} className="text-center">
                Đã chấm {answered}/{rows.length}
                {blockers.missingPhoto > 0 ? ` · ${blockers.missingPhoto} lỗi chưa có ảnh` : ''}
                {unsaved ? ' · có thay đổi chưa lưu lên máy chủ' : ''}
              </Text>
              {busy ? <Text variant="caption" tone="primary" className="text-center">{busy}</Text> : null}
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button variant="outline" disabled={!!busy || !unsaved} onPress={handleSave}>
                    Lưu
                  </Button>
                </View>
                <View className="flex-1">
                  <Button loading={!!busy} disabled={!!busy || !blockers.ready} onPress={handleSubmit}>
                    Nộp
                  </Button>
                </View>
              </View>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

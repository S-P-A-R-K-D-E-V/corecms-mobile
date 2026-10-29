import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Badge, TextField, SegmentedControl, type Segment } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { useAuthContext } from 'src/auth/auth-context';
import { PERMISSIONS, hasPermission } from 'src/auth/permissions';
import { fixInspectionResult, getMyInspectionFaults, getOpenInspectionFaults, uploadInspectionPhoto } from 'src/api/inspection';
import { INSPECTION_TYPE_LABEL, type IInspectionFault } from 'src/types/inspection';
import { MAX_INSPECTION_PHOTOS, type DraftPhoto } from './inspection-draft';
import { captureInspectionPhoto, discardInspectionPhoto } from './inspection-photos';
import { LevelBadge, PhotoRules, PhotoStrip } from './inspection-ui';

// ----------------------------------------------------------------------
// Lỗi kiểm tra của tôi: đang mở + cả tháng này. "Đã sửa" = ghi chú + ảnh sau khi sửa (bắt buộc nếu mục cần ảnh).
// Người có inspection.read thấy thêm "Mọi lỗi"; inspection.manage đánh dấu thay được. Lỗi chỉ để kèm cặp — không
// có tiền phạt.
// ----------------------------------------------------------------------

type Tab = 'open' | 'month' | 'all';

const fmt = (iso: string | null) => (iso ? dayjs(iso).format('HH:mm DD/MM') : '');

export function FaultCard({ fault, canFix, onFix }: { fault: IInspectionFault; canFix: boolean; onFix: () => void }) {
  return (
    <SectionCard
      title={`${fault.itemCode} · ${fault.itemTitle}`}
      right={<LevelBadge level={fault.level} />}
      bodyClassName="pt-0 gap-1.5"
    >
      <Text variant="caption" tone="muted">
        {INSPECTION_TYPE_LABEL[fault.inspectionType]} · {fault.shiftName} · {dayjs(fault.date).format('DD/MM')}
      </Text>
      <Text variant="caption" tone="muted">Đạt khi: {fault.passCriteria}</Text>
      {fault.note ? <Text variant="bodySmall">Ghi chú: {fault.note}</Text> : null}
      <PhotoStrip server={fault.photos} />
      {fault.fixedAt ? (
        <View className="gap-0.5">
          <Badge tone="success">Đã sửa {fmt(fault.fixedAt)}</Badge>
          {fault.fixNote ? <Text variant="caption" tone="muted">{fault.fixNote}</Text> : null}
        </View>
      ) : (
        <>
          {fault.fixDeadlineAt ? (
            <Text variant="caption" tone={fault.isOverdue ? 'error' : 'warning'} className="font-semibold">
              {fault.isOverdue ? 'Quá hạn sửa' : 'Hạn sửa'} {fmt(fault.fixDeadlineAt)}
            </Text>
          ) : null}
          {canFix ? (
            <Button size="sm" icon="check-circle-outline" onPress={onFix}>
              Đã sửa
            </Button>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

export function FixSheet({ fault, onClose, onDone }: { fault: IInspectionFault | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const needPhoto = !!fault?.requiresPhotoOnFail && photos.length === 0;

  function close() {
    photos.forEach((p) => void discardInspectionPhoto(p.uri));
    setPhotos([]);
    setNote('');
    onClose();
  }

  async function capture() {
    if (!fault) return;
    const photo = await captureInspectionPhoto(fault.inspectionId);
    if (photo) setPhotos((prev) => [...prev, photo].slice(0, MAX_INSPECTION_PHOTOS));
  }

  async function submit() {
    if (!fault || needPhoto) return;
    try {
      const keys: string[] = [];
      for (const [i, p] of photos.entries()) {
        setBusy(`Đang tải ảnh ${i + 1}/${photos.length}…`);
        keys.push(p.key ?? (await uploadInspectionPhoto(fault.inspectionId, p)));
        // Giữ key đã có để bấm lại không tải lại ảnh đã lên.
        setPhotos((prev) => prev.map((x, j) => (j === i ? { ...x, key: keys[i] } : x)));
      }
      setBusy('Đang ghi nhận…');
      await fixInspectionResult(fault.resultId, note.trim() || null, keys);
      photos.forEach((p) => void discardInspectionPhoto(p.uri));
      setPhotos([]);
      setNote('');
      toast.success('Đã ghi nhận đã sửa.');
      onDone();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa ghi nhận được');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      visible={!!fault}
      title={fault ? `Đã sửa: ${fault.itemCode} · ${fault.itemTitle}` : ''}
      onClose={busy ? () => {} : close}
      footer={
        <Button loading={!!busy} disabled={!!busy || needPhoto} onPress={submit}>
          {needPhoto ? 'Cần ảnh sau khi sửa' : 'Ghi nhận đã sửa'}
        </Button>
      }
    >
      <View className="gap-3">
        <PhotoRules />
        <TextField placeholder="Đã làm gì (không bắt buộc)" value={note} onChangeText={setNote} multiline />
        <PhotoStrip
          server={[]}
          local={photos}
          onRemoveLocal={busy ? undefined : (i) => {
            const p = photos[i];
            if (p) void discardInspectionPhoto(p.uri);
            setPhotos((prev) => prev.filter((_, j) => j !== i));
          }}
        />
        {photos.length < MAX_INSPECTION_PHOTOS ? (
          <Button variant="outline" icon="camera-outline" disabled={!!busy} onPress={capture}>
            {fault?.requiresPhotoOnFail ? 'Chụp ảnh sau khi sửa (bắt buộc)' : 'Chụp ảnh sau khi sửa'}
          </Button>
        ) : null}
        {busy ? <Text variant="caption" tone="primary">{busy}</Text> : null}
      </View>
    </Sheet>
  );
}

export function InspectionFaultsScreen() {
  const qc = useQueryClient();
  const { user } = useAuthContext();
  const canReadAll = hasPermission(user, PERMISSIONS.inspection.read);
  const canManage = hasPermission(user, PERMISSIONS.inspection.manage);
  const [tab, setTab] = useState<Tab>('open');
  const [fixing, setFixing] = useState<IInspectionFault | null>(null);

  const query = useQuery({
    queryKey: ['inspection', 'faults', tab],
    queryFn: () =>
      tab === 'month' ? getMyInspectionFaults() : getOpenInspectionFaults(tab === 'all' ? 'all' : 'mine'),
  });

  const segments: Segment[] = [
    { key: 'open', label: 'Đang mở' },
    { key: 'month', label: 'Tháng này' },
    ...(canReadAll ? [{ key: 'all', label: 'Mọi lỗi' }] : []),
  ];

  const list = query.data ?? [];

  return (
    <Screen scroll refreshing={query.isFetching} onRefresh={query.refetch}>
      <AppHeader title="Lỗi kiểm tra" back />
      <SegmentedControl segments={segments} value={tab} onChange={(k) => setTab(k as Tab)} />
      <Text variant="caption" tone="muted">
        Lỗi kiểm tra dùng để nhắc việc và kèm cặp, không trừ lương. Mục B sửa trong 15 phút, mục T sửa trong ca.
      </Text>

      {query.isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được lỗi: {extractApiError(query.error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
        </View>
      ) : !query.isLoading && list.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted">{tab === 'month' ? 'Tháng này chưa có lỗi nào.' : 'Không có lỗi nào đang mở.'}</Text>
        </View>
      ) : (
        list.map((f) => (
          <FaultCard key={f.resultId} fault={f} canFix={tab !== 'all' || canManage} onFix={() => setFixing(f)} />
        ))
      )}

      <FixSheet
        fault={fixing}
        onClose={() => setFixing(null)}
        onDone={() => {
          setFixing(null);
          qc.invalidateQueries({ queryKey: ['inspection'] });
        }}
      />
    </Screen>
  );
}

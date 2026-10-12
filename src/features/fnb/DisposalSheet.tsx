import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';

import { createFnbDisposal, getFnbStock, uploadFnbDisposalPhotos, type DisposalPhoto } from 'src/api/fnb';
import { Sheet } from 'src/components/shared';
import { Button, Chip, Icon, Pressable, Spinner, Text, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { imagePickerQuality } from 'src/features/chat/attachment-prepare';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';

import { newId } from './fnb-ids';
import {
  DISPOSAL_REASONS,
  MAX_DISPOSAL_LINES,
  MAX_DISPOSAL_PHOTOS,
  disposalError,
  newDisposalLine,
  searchIngredients,
  toDisposalLines,
  type DisposalLineDraft,
} from './disposal';

// ----------------------------------------------------------------------
// Phiếu xuất huỷ nguyên liệu trên app (cần mạng, gọi thẳng API): tìm nguyên liệu, nhập số lượng theo đơn vị gốc hoặc
// đơn vị mua, chọn lý do, chụp ảnh (tải thẳng lên R2 bằng URL ký sẵn) → gửi. Nhân viên lập thì phiếu chờ quản lý duyệt
// mới trừ kho; quản lý lập thì trừ kho ngay. Phiếu giá trị lớn bắt buộc có ảnh (máy chủ kiểm). Duyệt / huỷ phiếu ở web.
// ----------------------------------------------------------------------

export function DisposalSheet({ visible, onClose, branchId }: { visible: boolean; onClose: () => void; branchId: string }) {
  const stockQ = useQuery({
    queryKey: ['fnb', 'stock', branchId],
    queryFn: () => getFnbStock(branchId),
    enabled: visible && !!branchId,
  });

  const [keyword, setKeyword] = useState('');
  const [lines, setLines] = useState<DisposalLineDraft[]>([]);
  const [photos, setPhotos] = useState<DisposalPhoto[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // Mã chống lập trùng của phiếu đang soạn.
  const [requestId, setRequestId] = useState(() => newId());

  useEffect(() => {
    if (!visible) return;
    setKeyword('');
    setLines([]);
    setPhotos([]);
    setNote('');
    setRequestId(newId());
  }, [visible]);

  const taken = useMemo(() => new Set(lines.map((l) => l.productId)), [lines]);
  const matches = useMemo(
    () => searchIngredients(stockQ.data?.ingredients ?? [], keyword, taken),
    [stockQ.data, keyword, taken]
  );
  const error = disposalError(lines);

  const patch = (productId: string, change: Partial<DisposalLineDraft>) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...change } : l)));

  async function takePhoto() {
    if (photos.length >= MAX_DISPOSAL_PHOTOS) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast.error(t('fnbStock.cameraDenied'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: imagePickerQuality(0.7), exif: false });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setPhotos((prev) => [
      ...prev,
      { uri: asset.uri, contentType: asset.mimeType ?? 'image/jpeg', fileName: asset.fileName ?? `xuat-huy-${prev.length + 1}.jpg` },
    ]);
  }

  async function submit() {
    if (error) return;
    setSaving(true);
    try {
      const photoKeys = await uploadFnbDisposalPhotos(photos);
      const note_ = note.trim() || null;
      const created = await createFnbDisposal({ branchId, clientRequestId: requestId, note: note_, photoKeys, lines: toDisposalLines(lines) });
      toast.success(t(created.status === 'Pending' ? 'fnbStock.disposalPending' : 'fnbStock.disposalDone', { code: created.code }));
      onClose();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title={t('fnbStock.disposalTitle')}
      onClose={onClose}
      footer={
        <Button icon="check" disabled={!!error || saving} loading={saving} onPress={() => void submit()}>
          {t('fnbStock.disposalSubmit')}
        </Button>
      }
    >
      {stockQ.isLoading ? (
        <View className="py-8 items-center"><Spinner /></View>
      ) : stockQ.isError ? (
        <Text variant="bodySmall" tone="error" className="py-6 text-center">{extractApiError(stockQ.error)}</Text>
      ) : (
        <View className="gap-4">
          {lines.map((line) => (
            <View key={line.productId} className="gap-2 p-3 rounded-2xl border border-line dark:border-line-dark">
              <View className="flex-row items-center gap-2">
                <Text variant="bodySmall" className="flex-1 font-bold">{line.name}</Text>
                <Pressable hitSlop={8} onPress={() => setLines((prev) => prev.filter((l) => l.productId !== line.productId))}>
                  <Icon name="close" size={18} tone="muted" />
                </Pressable>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-28">
                  <TextField
                    placeholder={t('fnbStock.disposalQty')}
                    value={line.quantity}
                    onChangeText={(v) => patch(line.productId, { quantity: v })}
                    keyboardType="decimal-pad"
                    maxLength={10}
                  />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                  <Chip label={line.unit ?? '—'} selected={line.unitId == null} color="primary" onPress={() => patch(line.productId, { unitId: null })} />
                  {line.units.map((u) => (
                    <Chip key={u.unitId} label={u.name} selected={line.unitId === u.unitId} color="primary" onPress={() => patch(line.productId, { unitId: u.unitId })} />
                  ))}
                </ScrollView>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                {DISPOSAL_REASONS.map((reason) => (
                  <Chip
                    key={reason}
                    label={t(`fnbStock.reason${reason}`)}
                    selected={line.reason === reason}
                    color="warning"
                    onPress={() => patch(line.productId, { reason })}
                  />
                ))}
              </ScrollView>
            </View>
          ))}

          {lines.length < MAX_DISPOSAL_LINES ? (
            <View className="gap-2">
              <TextField
                label={t('fnbStock.disposalSearch')}
                value={keyword}
                onChangeText={setKeyword}
                maxLength={50}
              />
              <View className="flex-row flex-wrap gap-2">
                {matches.map((i) => (
                  <Chip key={i.id} icon="plus" label={i.name} onPress={() => { setLines((prev) => [...prev, newDisposalLine(i)]); setKeyword(''); }} />
                ))}
                {matches.length === 0 ? <Text variant="caption" tone="muted">{t('fnbStock.disposalEmpty')}</Text> : null}
              </View>
            </View>
          ) : null}

          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text variant="label" tone="muted">{t('fnbStock.disposalPhotos', { n: photos.length, max: MAX_DISPOSAL_PHOTOS })}</Text>
              <Button variant="outline" size="sm" icon="camera" disabled={photos.length >= MAX_DISPOSAL_PHOTOS} onPress={() => void takePhoto()}>
                {t('fnbStock.disposalPhoto')}
              </Button>
            </View>
            {photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                {photos.map((p, index) => (
                  <Pressable key={p.uri} onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}>
                    <Image source={{ uri: p.uri }} style={{ width: 72, height: 72, borderRadius: 12 }} />
                    <View className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5"><Icon name="close" size={12} tone="inverse" /></View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <Text variant="caption" tone="muted">{t('fnbStock.disposalPhotoHint')}</Text>
          </View>

          <TextField label={t('fnbStock.note')} value={note} onChangeText={setNote} maxLength={500} />
          {error && lines.length > 0 ? <Text variant="caption" tone="error">{t(error)}</Text> : null}
        </View>
      )}
    </Sheet>
  );
}

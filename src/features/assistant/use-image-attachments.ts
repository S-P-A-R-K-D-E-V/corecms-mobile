import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

import { toast } from 'src/components/overlay';
import { t } from 'src/i18n';
import { presignAssistantImages } from 'src/api/assistant';
import { putToPresignedUrl, readLocalFile, type PresignedTarget } from 'src/api/presigned-upload';
import { nameFromUri } from 'src/features/chat/attachment-rules';
import { checkImage, imageErrorKey, type ImageRules } from './image-attachments';

// ----------------------------------------------------------------------
// Ảnh đính kèm ở ô soạn trợ lý: chọn ảnh → kiểm loại/dung lượng → xin presigned URL (một lượt cho cả lô)
// → PUT song song thẳng lên R2. Ảnh không bao giờ đi qua API; câu hỏi chỉ mang objectKey.
// Không thêm thư viện nén: picker nén JPEG (quality 0.7), iOS xin bản tương thích (không HEIC).
// ----------------------------------------------------------------------

export type ImageAttachmentItem = {
  id: string;
  localUri: string;
  type: string;
  size: number;
  fileName: string;
  status: 'uploading' | 'ready' | 'error';
  objectKey?: string;
};

let seq = 0;

export function useImageAttachments(sessionId: string | null, rules: ImageRules) {
  const [items, setItems] = useState<ImageAttachmentItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Giữ blob để Thử lại không phải đọc lại tệp.
  const blobsRef = useRef(new Map<string, Blob>());
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  // objectKey gắn với phiên (assistant/{user}/{phiên}/…) → đổi phiên thì bỏ hết.
  useEffect(() => {
    setItems([]);
    blobsRef.current.clear();
  }, [sessionId]);

  const patch = useCallback((id: string, p: Partial<ImageAttachmentItem>) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }, []);

  const upload = useCallback(
    async (batch: ImageAttachmentItem[]) => {
      const sid = sessionRef.current;
      if (!sid || batch.length === 0) {
        batch.forEach((i) => patch(i.id, { status: 'error' }));
        return;
      }
      let targets: PresignedTarget[];
      try {
        targets = await presignAssistantImages(
          sid,
          batch.map((i) => ({ fileName: i.fileName, contentType: i.type, sizeBytes: i.size }))
        );
      } catch (err) {
        if (sessionRef.current !== sid) return;
        batch.forEach((i) => patch(i.id, { status: 'error' }));
        toast.error(t(`assistant.${imageErrorKey(err)}`));
        return;
      }
      await Promise.all(
        batch.map(async (item, idx) => {
          const target = targets[idx]!;
          const blob = blobsRef.current.get(item.id);
          try {
            if (!blob) throw new Error('missing blob');
            await putToPresignedUrl(target, blob, item.type);
            if (sessionRef.current === sid) patch(item.id, { status: 'ready', objectKey: target.objectKey });
          } catch {
            if (sessionRef.current === sid) patch(item.id, { status: 'error', objectKey: undefined });
          }
        })
      );
    },
    [patch]
  );

  const pick = useCallback(async () => {
    const room = rules.maxImages - itemsRef.current.length;
    if (room <= 0) {
      toast.info(t('assistant.imageLimit', { n: rules.maxImages }));
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error(t('assistant.photoPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: room > 1,
      selectionLimit: room,
      quality: 0.7,
      // iOS mặc định trả HEIC gốc (server không nhận) → xin bản JPEG tương thích.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      exif: false,
    });
    if (result.canceled || result.assets.length === 0) return;

    const added: ImageAttachmentItem[] = [];
    let rejected: 'imageTypeUnsupported' | 'imageTooLarge' | 'uploadFailed' | null = null;
    for (const asset of result.assets.slice(0, room)) {
      let blob: Blob;
      try {
        blob = await readLocalFile(asset.uri);
      } catch {
        rejected = 'uploadFailed';
        continue;
      }
      const check = checkImage({ name: asset.fileName ?? nameFromUri(asset.uri), mimeType: asset.mimeType ?? blob.type, size: blob.size }, rules);
      if (!check.ok) {
        rejected = check.reason === 'type' ? 'imageTypeUnsupported' : check.reason === 'size' ? 'imageTooLarge' : 'uploadFailed';
        continue;
      }
      const id = `img-${Date.now()}-${seq++}`;
      blobsRef.current.set(id, blob);
      added.push({ id, localUri: asset.uri, type: check.contentType, size: blob.size, fileName: check.fileName, status: 'uploading' });
    }
    if (rejected) toast.error(t(`assistant.${rejected}`));
    if (added.length === 0) return;
    setItems((prev) => [...prev, ...added]);
    await upload(added);
  }, [rules, upload]);

  const retry = useCallback(
    (item: ImageAttachmentItem) => {
      patch(item.id, { status: 'uploading', objectKey: undefined });
      void upload([{ ...item, status: 'uploading' }]);
    },
    [patch, upload]
  );

  const remove = useCallback((item: ImageAttachmentItem) => {
    blobsRef.current.delete(item.id);
    setItems((prev) => prev.filter((x) => x.id !== item.id));
  }, []);

  const clear = useCallback(() => {
    blobsRef.current.clear();
    setItems([]);
  }, []);

  const ready = items.filter((i) => i.status === 'ready' && i.objectKey);
  return {
    items,
    ready,
    uploading: items.some((i) => i.status === 'uploading'),
    canAddMore: items.length < rules.maxImages,
    pick,
    retry,
    remove,
    clear,
  };
}

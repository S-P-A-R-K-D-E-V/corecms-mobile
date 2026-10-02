import { useCallback, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';

import { presignAttachments, uploadToPresignedUrl, sendAttachmentMessage, type PresignedAttachment } from 'src/api/messenger';
import { useMessengerStore } from 'src/store/messenger-store';
import { toast } from 'src/components/overlay';
import { t } from 'src/i18n';
import {
  MAX_FILES_PER_MESSAGE,
  MAX_PARALLEL_UPLOADS,
  describeUploadError,
  runPool,
  validateAttachments,
  withRetry,
  type UploadErrorInfo,
} from './attachment-rules';
import { prepareAttachment, type PickedAttachment, type PreparedAttachment } from './attachment-prepare';
import { issueMessage, uploadErrorMessage } from './attachment-messages';

// ----------------------------------------------------------------------
// Hàng chờ gửi tệp của một hội thoại: chuẩn bị (HEIC → JPEG, thu nhỏ) → xin presigned URL → PUT thẳng lên R2
// (tối đa 3 tệp cùng lúc, tự thử lại lỗi mạng) → gửi tin kèm objectKey. Lỗi thì giữ nguyên lô để bấm
// "Thử lại": tệp đã lên R2 không tải lại, tệp lỗi xin URL mới; gửi tin dùng lại clientMessageId (không trùng).
// ----------------------------------------------------------------------

export type OutboxItem = PreparedAttachment & {
  id: string;
  progress: number;
  objectKey?: string;
  failed?: boolean;
};

export type OutboxPhase = 'preparing' | 'uploading' | 'sending' | 'error';

export type Outbox = {
  /** Số tệp đã chọn (hiện trong lúc chuẩn bị, khi items còn rỗng). */
  count: number;
  items: OutboxItem[];
  caption: string;
  clientMessageId: string;
  phase: OutboxPhase;
  error?: string;
  canRetry?: boolean;
};

export function useAttachmentOutbox(conversationId: string) {
  const addMessage = useMessengerStore((s) => s.addMessage);
  const [outbox, setOutbox] = useState<Outbox | null>(null);
  // Bản mới nhất cho các bước async (state React chỉ để vẽ).
  const ref = useRef<Outbox | null>(null);
  const runToken = useRef(0);

  const commit = useCallback((next: Outbox | null) => {
    ref.current = next;
    setOutbox(next);
  }, []);

  const patch = useCallback(
    (fn: (o: Outbox) => Outbox) => {
      if (ref.current) commit(fn(ref.current));
    },
    [commit]
  );

  const patchItem = useCallback(
    (id: string, fn: (i: OutboxItem) => OutboxItem) => patch((o) => ({ ...o, items: o.items.map((i) => (i.id === id ? fn(i) : i)) })),
    [patch]
  );

  const run = useCallback(async () => {
    const token = ++runToken.current;
    const alive = () => runToken.current === token && ref.current !== null;
    const fail = (info: UploadErrorInfo) => {
      if (alive()) patch((o) => ({ ...o, phase: 'error', error: uploadErrorMessage(info), canRetry: info.retryable }));
    };

    // 1) Tệp chưa lên R2: xin URL rồi PUT.
    const pending = (ref.current?.items ?? []).filter((i) => !i.objectKey);
    if (pending.length > 0) {
      patch((o) => ({
        ...o,
        phase: 'uploading',
        error: undefined,
        items: o.items.map((i) => (i.objectKey ? i : { ...i, progress: 0, failed: false })),
      }));

      let targets: PresignedAttachment[];
      try {
        const res = await withRetry(
          () => presignAttachments(conversationId, pending.map((i) => ({ fileName: i.name, contentType: i.contentType, size: i.size }))),
          { shouldRetry: (e) => describeUploadError(e, 'presign').retryable }
        );
        targets = res.files;
      } catch (e) {
        fail(describeUploadError(e, 'presign'));
        return;
      }
      if (!alive()) return;

      const results = await runPool(pending, MAX_PARALLEL_UPLOADS, async (item, idx) => {
        const target = targets[idx];
        let shown = 0;
        await withRetry(
          () =>
            uploadToPresignedUrl(target, item, (sent, total) => {
              const p = total > 0 ? sent / total : 0;
              if (p - shown >= 0.02 || p >= 1) {
                shown = p;
                patchItem(item.id, (i) => ({ ...i, progress: p }));
              }
            }),
          // URL hết hạn thì thử lại cũng vô ích — để người dùng bấm "Thử lại" (xin URL mới).
          { shouldRetry: (e) => { const d = describeUploadError(e, 'upload'); return d.retryable && d.key !== 'linkExpired'; } }
        );
        patchItem(item.id, (i) => ({ ...i, progress: 1, objectKey: target.objectKey }));
      });
      if (!alive()) return;

      const failedIdx = results.findIndex((r) => r.status === 'rejected');
      if (failedIdx >= 0) {
        const failedIds = new Set(results.flatMap((r, i) => (r.status === 'rejected' ? [pending[i].id] : [])));
        patch((o) => ({ ...o, items: o.items.map((i) => (failedIds.has(i.id) ? { ...i, failed: true } : i)) }));
        fail(describeUploadError((results[failedIdx] as PromiseRejectedResult).reason, 'upload'));
        return;
      }
    }

    // 2) Gửi tin kèm objectKey — server kiểm tệp thuộc hội thoại / người gửi, có thật, đúng loại & dung lượng.
    patch((o) => ({ ...o, phase: 'sending', error: undefined }));
    const o = ref.current;
    if (!o) return;
    try {
      const msg = await withRetry(
        () =>
          sendAttachmentMessage(conversationId, {
            content: o.caption,
            attachments: o.items.map((i) => ({ objectKey: i.objectKey!, fileName: i.name })),
            clientMessageId: o.clientMessageId,
          }),
        // Mất mạng lúc gửi tin: có thể server đã nhận (chưa chống trùng theo clientMessageId) → không tự gửi
        // lại, để người dùng bấm "Thử lại". Lỗi 5xx/429 thì chưa tạo tin → tự thử lại.
        { shouldRetry: (e) => { const d = describeUploadError(e, 'send'); return d.retryable && d.key !== 'network'; } }
      );
      if (runToken.current !== token) return;
      // Hiện ngay, không chờ SignalR (store bỏ trùng theo id).
      if (msg?.id) addMessage(msg);
      commit(null);
    } catch (e) {
      fail(describeUploadError(e, 'send'));
    }
  }, [conversationId, addMessage, commit, patch, patchItem]);

  /** Bắt đầu gửi một lô. Trả false nếu không gửi (đang bận / tệp không hợp lệ — đã báo toast). */
  const start = useCallback(
    async (picked: PickedAttachment[], caption: string): Promise<boolean> => {
      if (ref.current || picked.length === 0) return false;
      if (picked.length > MAX_FILES_PER_MESSAGE) {
        toast.warning(issueMessage({ code: 'too_many_files', max: MAX_FILES_PER_MESSAGE }), t('chat.attach.invalidTitle'));
        return false;
      }
      const clientMessageId = Crypto.randomUUID();
      commit({ count: picked.length, items: [], caption, clientMessageId, phase: 'preparing' });

      const items: OutboxItem[] = [];
      try {
        // Tuần tự: mỗi ảnh giải mã tốn nhiều RAM.
        for (const p of picked) {
          const prepared = await prepareAttachment(p);
          items.push({ ...prepared, id: `${clientMessageId}-${items.length}`, progress: 0 });
        }
      } catch {
        commit(null);
        toast.error(t('chat.attach.prepareFailed'), t('chat.attach.failedTitle'));
        return false;
      }

      const issue = validateAttachments(items);
      if (issue) {
        commit(null);
        toast.warning(issueMessage(issue), t('chat.attach.invalidTitle'));
        return false;
      }
      patch((o) => ({ ...o, items, phase: 'uploading' }));
      void run();
      return true;
    },
    [commit, patch, run]
  );

  const retry = useCallback(() => {
    if (ref.current?.phase === 'error') void run();
  }, [run]);

  /** Bỏ lô đang lỗi; trả lại chú thích để đưa về ô nhập. */
  const discard = useCallback((): string => {
    runToken.current++;
    const caption = ref.current?.caption ?? '';
    commit(null);
    return caption;
  }, [commit]);

  return { outbox, busy: outbox !== null, start, retry, discard };
}

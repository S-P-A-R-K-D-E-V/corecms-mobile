import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Button, Chip, Icon, Pressable, Text, TextField } from 'src/components/ui';
import type { AgentActionView } from 'src/api/agent-actions';

import { agentLine } from './AgentActionCard';
import {
  REVISION_QUICK_NOTES,
  actionTitle,
  appendQuickNote,
  canRequestRevision,
  canSubmitRevision,
  revisionsLeftText,
  socialPostOf,
} from './agent-action-format';

// ----------------------------------------------------------------------
// "Yêu cầu sửa" một phiếu agent: lệnh KHÔNG chạy, agent nhận ghi chú (+ ảnh cần làm lại) rồi gửi bản mới để duyệt lại.
// Cần ghi chú hoặc ít nhất một ảnh. Lỗi của máy chủ (vd hết lượt sửa) hiện ngay trong hộp.
// ----------------------------------------------------------------------

const THUMB = 72;

export function RevisionSheet({
  action,
  visible,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  action: AgentActionView | null;
  visible: boolean;
  busy: boolean;
  /** Câu lỗi của máy chủ (ProblemDetails detail / title) của lần gửi trước; null = không lỗi. */
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { note: string; imageUrls: string[] }) => void;
}) {
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const open = visible && !!action;

  useEffect(() => {
    if (open) {
      setNote('');
      setImages([]);
    }
  }, [open, action?.id]);

  const post = socialPostOf(action);
  const allowed = action ? canRequestRevision(action) : false;
  const ready = canSubmitRevision(note, images);
  const leftText = revisionsLeftText(action?.revisionsLeft);

  function toggleImage(url: string) {
    setImages((cur) => (cur.includes(url) ? cur.filter((u) => u !== url) : [...cur, url]));
  }

  return (
    <Sheet
      visible={open}
      title="Yêu cầu agent sửa"
      onClose={busy ? () => {} : onClose}
      footer={
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button variant="outline" action="neutral" disabled={busy} onPress={onClose}>
              Huỷ
            </Button>
          </View>
          <View className="flex-1">
            <Button
              icon="pencil-outline"
              loading={busy}
              disabled={busy || !allowed || !ready}
              onPress={() => onSubmit({ note: note.trim(), imageUrls: images })}
            >
              Gửi yêu cầu
            </Button>
          </View>
        </View>
      }
    >
      {action ? (
        <View className="gap-3">
          <View className="gap-0.5">
            <Text variant="caption" tone="muted">{agentLine(action)}</Text>
            <Text variant="body" className="font-semibold">{actionTitle(action)}</Text>
          </View>

          <View className="flex-row gap-2 rounded-xl bg-info-soft px-3 py-2.5">
            <Icon name="information-outline" size={18} tone="info" />
            <Text variant="caption" className="flex-1">
              Lệnh chưa chạy. Agent nhận ghi chú, sửa đúng phần bạn nêu rồi gửi bản mới để bạn duyệt lại.
              {leftText ? ` ${leftText}.` : ''}
            </Text>
          </View>

          {!allowed ? (
            <Text variant="bodySmall" tone="error">
              Việc này đã hết lượt yêu cầu sửa — hãy Duyệt, Từ chối hoặc nhắn agent trên bảng việc.
            </Text>
          ) : null}

          <TextField
            label="Cần sửa gì?"
            placeholder="Vd: ảnh 2 tối quá, viết ngắn lại, thêm giá…"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
            editable={!busy && allowed}
          />

          <View className="flex-row flex-wrap gap-1.5">
            {REVISION_QUICK_NOTES.map((chip) => (
              <Chip
                key={chip}
                size="sm"
                variant="outlined"
                icon="plus"
                label={chip}
                onPress={busy || !allowed ? undefined : () => setNote((cur) => appendQuickNote(cur, chip))}
              />
            ))}
          </View>

          {post && post.imageUrls.length > 0 ? (
            <View className="gap-1.5">
              <Text variant="caption" tone="muted">
                Chọn ảnh cần làm lại{images.length > 0 ? ` (đã chọn ${images.length})` : ''}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {post.imageUrls.map((url, i) => {
                  const selected = images.includes(url);
                  return (
                    <Pressable
                      key={`${url}-${i}`}
                      disabled={busy || !allowed}
                      onPress={() => toggleImage(url)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`Ảnh ${i + 1}${selected ? ' — đã chọn làm lại' : ''}`}
                    >
                      <Image
                        source={{ uri: url }}
                        style={{ width: THUMB, height: THUMB, borderRadius: 10, opacity: selected ? 1 : 0.85 }}
                        className="bg-ink/5 dark:bg-white/5"
                      />
                      <View
                        pointerEvents="none"
                        className={`absolute inset-0 rounded-[10px] border-2 ${selected ? 'border-primary' : 'border-transparent'}`}
                      />
                      <View
                        pointerEvents="none"
                        className={`absolute right-1 top-1 w-5 h-5 rounded-full items-center justify-center ${selected ? 'bg-primary' : 'bg-black/40'}`}
                      >
                        {selected ? <Icon name="check" size={14} color="#FFFFFF" /> : null}
                      </View>
                      <Text variant="caption" tone="muted" className="text-center mt-0.5">Ảnh {i + 1}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {!ready && allowed ? (
            <Text variant="caption" tone="faint">Ghi cần sửa gì hoặc chọn ít nhất một ảnh để gửi.</Text>
          ) : null}

          {error ? (
            <View className="flex-row gap-2 rounded-xl bg-error-soft px-3 py-2.5">
              <Icon name="alert-circle-outline" size={18} tone="error" />
              <Text variant="caption" tone="error" className="flex-1">{error}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

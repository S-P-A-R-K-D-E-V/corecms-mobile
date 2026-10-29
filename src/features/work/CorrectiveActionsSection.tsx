import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Badge, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { getMyCorrectiveActions, markCorrectiveActionDone } from 'src/api/inspection';
import type { ICorrectiveAction } from 'src/types/inspection';

// ----------------------------------------------------------------------
// Sửa tận gốc giao cho tôi: việc khắc phục lỗi lặp (thiếu chỗ, thiếu dụng cụ…) quản lý giao, có hạn. Làm xong bấm "Xong".
// Nằm chung khối việc giao riêng trong màn Việc của tôi.
// ----------------------------------------------------------------------

export const correctiveMineKey = ['corrective-actions', 'mine'] as const;

/** Quá hạn: có hạn và hạn đã qua (theo ngày). */
export function isCorrectiveOverdue(action: ICorrectiveAction, today: string): boolean {
  return !!action.dueDate && action.dueDate.slice(0, 10) < today;
}

function ActionCard({ action, today, onDone }: { action: ICorrectiveAction; today: string; onDone: () => void }) {
  const overdue = isCorrectiveOverdue(action, today);
  return (
    <SectionCard
      title={action.title}
      right={<Badge tone="warning">Sửa tận gốc</Badge>}
      bodyClassName="pt-0 gap-1.5"
    >
      {action.itemCode ? <Text variant="caption" tone="muted">Hạng mục {action.itemCode}</Text> : null}
      {action.rootCause ? <Text variant="bodySmall">Nguyên nhân: {action.rootCause}</Text> : null}
      {action.action ? <Text variant="bodySmall">Cách làm: {action.action}</Text> : null}
      {action.dueDate ? (
        <Text variant="caption" tone={overdue ? 'error' : 'muted'} className={overdue ? 'font-semibold' : undefined}>
          {overdue ? 'Quá hạn' : 'Hạn'} {dayjs(action.dueDate).format('DD/MM')}
        </Text>
      ) : null}
      <Button size="sm" icon="check-circle-outline" onPress={onDone}>
        Xong
      </Button>
    </SectionCard>
  );
}

function DoneSheet({ action, onClose, onDone }: { action: ICorrectiveAction | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!action) return;
    setBusy(true);
    try {
      await markCorrectiveActionDone(action.id, note.trim() || null);
      setNote('');
      toast.success('Đã ghi nhận xong.');
      onDone();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa ghi nhận được');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={!!action}
      title={action ? `Xong: ${action.title}` : ''}
      onClose={busy ? () => {} : onClose}
      footer={
        <Button loading={busy} disabled={busy} onPress={submit}>
          Ghi nhận xong
        </Button>
      }
    >
      <TextField placeholder="Đã làm gì (không bắt buộc)" value={note} onChangeText={setNote} multiline />
    </Sheet>
  );
}

export function CorrectiveActionsSection({ enabled = true }: { enabled?: boolean }) {
  const qc = useQueryClient();
  const today = dayjs().format('YYYY-MM-DD');
  const [doing, setDoing] = useState<ICorrectiveAction | null>(null);
  // Backend cũ chưa có /corrective-actions/mine → coi như không có việc.
  const query = useQuery({ queryKey: correctiveMineKey, queryFn: () => getMyCorrectiveActions().catch(() => []), enabled });

  const list = (query.data ?? []).filter((a) => a.status === 'Open');
  if (!enabled || list.length === 0) return null;

  return (
    <View className="gap-3">
      {list.map((a) => (
        <ActionCard key={a.id} action={a} today={today} onDone={() => setDoing(a)} />
      ))}
      <DoneSheet
        action={doing}
        onClose={() => setDoing(null)}
        onDone={() => {
          setDoing(null);
          qc.invalidateQueries({ queryKey: ['corrective-actions'] });
        }}
      />
    </View>
  );
}

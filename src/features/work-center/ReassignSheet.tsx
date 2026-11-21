import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Sheet } from 'src/components/shared';
import { Button, Text } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { reassignWorkTask } from 'src/api/hr';
import type { IWorkTask } from 'src/types/hr';

import { StaffChips } from './work-center-ui';

// ----------------------------------------------------------------------
// Đổi người làm một việc giao (PUT work-tasks/{id}/reassign, hr.task.manage) — chỉ việc Đã giao / Trả lại; core-be báo người
// mới. Dùng ở tab Giao việc và màn Chấm việc giao.
// ----------------------------------------------------------------------

export function ReassignSheet({ task, onClose }: { task: IWorkTask | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setAssigneeId(null), [task]);

  async function save() {
    if (!task || !assigneeId) return;
    setBusy(true);
    try {
      await reassignWorkTask(task.id, assigneeId);
      toast.success('Đã giao lại — người mới đã được báo');
      qc.invalidateQueries({ queryKey: ['work-center'] });
      qc.invalidateQueries({ queryKey: ['work-task-review'] });
      qc.invalidateQueries({ queryKey: ['home', 'work-today'] });
      onClose();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa đổi được người');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={!!task}
      title={task ? `Đổi người: ${task.title}` : ''}
      onClose={busy ? () => {} : onClose}
      footer={
        <Button loading={busy} disabled={!assigneeId} onPress={save}>
          Giao lại
        </Button>
      }
    >
      <View className="gap-2">
        {task?.assigneeName ? (
          <Text variant="bodySmall" tone="muted">
            Đang giao: {task.assigneeName}
          </Text>
        ) : null}
        <StaffChips label="Giao cho" value={assigneeId} onChange={setAssigneeId} excludeId={task?.assigneeId ?? null} />
        <Text variant="caption" tone="faint">
          Người mới nhận thông báo; hạn giữ nguyên.
        </Text>
      </View>
    </Sheet>
  );
}

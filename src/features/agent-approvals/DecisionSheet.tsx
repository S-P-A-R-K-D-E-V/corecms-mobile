import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Button, Icon, Text, TextField } from 'src/components/ui';
import type { AgentActionView } from 'src/api/agent-actions';

import { agentLine } from './AgentActionCard';

// ----------------------------------------------------------------------
// Xác nhận Duyệt / Từ chối một phiếu agent, kèm ghi chú (không bắt buộc). Duyệt: cảnh báo máy chủ chạy lệnh NGAY.
// ----------------------------------------------------------------------

export type DecisionMode = 'approve' | 'reject';

export function DecisionSheet({
  action,
  mode,
  busy,
  onClose,
  onSubmit,
}: {
  action: AgentActionView | null;
  mode: DecisionMode | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  const visible = !!action && !!mode;
  const approve = mode === 'approve';

  useEffect(() => {
    if (visible) setNote('');
  }, [visible, mode]);

  return (
    <Sheet
      visible={visible}
      title={approve ? 'Duyệt và chạy ngay?' : 'Từ chối việc này?'}
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
              action={approve ? 'primary' : 'error'}
              icon={approve ? 'check-circle-outline' : 'close-circle-outline'}
              loading={busy}
              disabled={busy}
              onPress={() => onSubmit(note)}
            >
              {approve ? 'Duyệt' : 'Từ chối'}
            </Button>
          </View>
        </View>
      }
    >
      {action ? (
        <>
          <Text variant="caption" tone="muted">{agentLine(action)}</Text>
          <Text variant="body" className="font-semibold">{action.summary}</Text>
          {approve ? (
            <View className="flex-row gap-2 rounded-xl bg-warning-soft px-3 py-2.5">
              <Icon name="alert-outline" size={18} tone="warning" />
              <Text variant="caption" tone="warning" className="flex-1">
                Hệ thống chạy lệnh này ngay khi bạn bấm Duyệt, bạn là người thực hiện. Thay đổi đã chạy không tự hoàn tác — kiểm
                tra lại tham số trước khi duyệt.
              </Text>
            </View>
          ) : (
            <Text variant="caption" tone="muted">Lệnh sẽ không chạy. Lý do (nếu ghi) được lưu cùng phiếu.</Text>
          )}
          <TextField
            label={approve ? 'Ghi chú (không bắt buộc)' : 'Lý do từ chối (không bắt buộc)'}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
            editable={!busy}
          />
        </>
      ) : null}
    </Sheet>
  );
}

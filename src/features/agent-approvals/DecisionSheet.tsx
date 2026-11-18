import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Button, Icon, Text, TextField } from 'src/components/ui';
import type { AgentActionView } from 'src/api/agent-actions';

import { agentLine } from './AgentActionCard';
import { actionTitle } from './agent-action-format';

// ----------------------------------------------------------------------
// Xác nhận Duyệt / Từ chối một phiếu agent, kèm ghi chú (không bắt buộc). Duyệt: cảnh báo máy chủ chạy lệnh NGAY.
// Từ chối: agent dừng hẳn việc, không làm lại (muốn agent sửa thì dùng "Yêu cầu sửa" — RevisionSheet).
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
          <Text variant="body" className="font-semibold">{actionTitle(action)}</Text>
          {approve ? (
            <View className="flex-row gap-2 rounded-xl bg-warning-soft px-3 py-2.5">
              <Icon name="alert-outline" size={18} tone="warning" />
              <Text variant="caption" tone="warning" className="flex-1">
                Hệ thống chạy lệnh này ngay khi bạn bấm Duyệt, bạn là người thực hiện. Thay đổi đã chạy không tự hoàn tác — kiểm
                tra lại nội dung trước khi duyệt.
              </Text>
            </View>
          ) : (
            <View className="flex-row gap-2 rounded-xl bg-error-soft px-3 py-2.5">
              <Icon name="stop-circle-outline" size={18} tone="error" />
              <Text variant="caption" tone="error" className="flex-1">
                Agent sẽ dừng việc này, không làm lại. Lệnh không chạy; lý do (nếu ghi) được lưu cùng phiếu. Muốn agent sửa
                rồi gửi lại thì chọn "Yêu cầu sửa".
              </Text>
            </View>
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

import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Badge, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { getMyHrRecords, refuseHrRecord, signHrRecord } from 'src/api/hr';
import { HR_RECORD_STATUS_LABEL, HR_RECORD_TYPE_LABEL, type HrRecordStatus, type IHrRecord } from 'src/types/hr';
import { fVnd } from './hr-rules';

// ----------------------------------------------------------------------
// Biên bản của tôi (Quy chế Chương VIII, Nội quy Điều 27): đọc, ghi ý kiến rồi ký; không đồng ý thì không ký và ghi rõ lý
// do. Biên bản chỉ ghi nhận — không phạt tiền, không trừ lương.
// ----------------------------------------------------------------------

const STATUS_TONE: Record<HrRecordStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
  AwaitingSignature: 'warning',
  Signed: 'success',
  RefusedToSign: 'error',
  Voided: 'neutral',
};

function RecordCard({ record: r, onSign, onRefuse }: { record: IHrRecord; onSign: () => void; onRefuse: () => void }) {
  return (
    <SectionCard
      title={`${HR_RECORD_TYPE_LABEL[r.type]}${r.violationLevel ? ` · mức ${r.violationLevel}` : ''}`}
      right={<Badge tone={STATUS_TONE[r.status]}>{HR_RECORD_STATUS_LABEL[r.status]}</Badge>}
      bodyClassName="pt-0 gap-1.5"
    >
      <Text variant="caption" tone="muted">
        Ngày {dayjs(r.occurredOn).format('DD/MM/YYYY')}
        {r.amount != null ? ` · ${fVnd(r.amount)}` : ''}
        {r.personalFault != null ? ` · ${r.personalFault ? 'có lỗi cá nhân' : 'không do lỗi cá nhân'}` : ''}
        {r.evaluatedMonth ? ` · tháng ${dayjs(r.evaluatedMonth).format('MM/YYYY')}` : ''}
      </Text>
      <Text variant="bodySmall">{r.description}</Text>
      {r.cause ? <Text variant="bodySmall">Nguyên nhân: {r.cause}</Text> : null}
      {r.improvementPlan ? <Text variant="bodySmall">Kế hoạch cải thiện: {r.improvementPlan}</Text> : null}
      {r.staffStatement ? <Text variant="caption" tone="muted">Ý kiến của bạn: {r.staffStatement}</Text> : null}
      {r.refusalReason ? <Text variant="caption" tone="warning">Không ký: {r.refusalReason}</Text> : null}
      {r.voidReason ? <Text variant="caption" tone="muted">Đã huỷ: {r.voidReason}</Text> : null}
      {r.status === 'AwaitingSignature' ? (
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button size="sm" icon="draw-pen" onPress={onSign}>Ký xác nhận</Button>
          </View>
          <View className="flex-1">
            <Button size="sm" variant="outline" action="error" onPress={onRefuse}>Không ký</Button>
          </View>
        </View>
      ) : null}
    </SectionCard>
  );
}

export function HrRecordsScreen() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['hr', 'records'], queryFn: getMyHrRecords });
  const [action, setAction] = useState<{ record: IHrRecord; kind: 'sign' | 'refuse' } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = query.data ?? [];

  function open(record: IHrRecord, kind: 'sign' | 'refuse') {
    setText('');
    setAction({ record, kind });
  }

  async function submit() {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === 'sign') await signHrRecord(action.record.id, text.trim() || null);
      else await refuseHrRecord(action.record.id, text.trim());
      toast.success(action.kind === 'sign' ? 'Đã ký biên bản.' : 'Đã ghi nhận không ký.');
      setAction(null);
      qc.invalidateQueries({ queryKey: ['hr', 'records'] });
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa lưu được');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll refreshing={query.isFetching} onRefresh={query.refetch}>
      <AppHeader title="Biên bản" back />
      <Text variant="caption" tone="muted">
        Biên bản chỉ ghi nhận sự việc — không phạt tiền, không trừ lương. Bạn được ghi ý kiến trước khi ký; không đồng ý thì
        không ký và ghi rõ lý do.
      </Text>

      {query.isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được biên bản: {extractApiError(query.error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
        </View>
      ) : !query.isLoading && list.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted">Bạn không có biên bản nào.</Text>
        </View>
      ) : (
        list.map((r) => <RecordCard key={r.id} record={r} onSign={() => open(r, 'sign')} onRefuse={() => open(r, 'refuse')} />)
      )}

      <Sheet
        visible={!!action}
        title={action?.kind === 'sign' ? 'Ký xác nhận biên bản' : 'Không ký biên bản'}
        onClose={busy ? () => {} : () => setAction(null)}
        footer={
          <Button
            loading={busy}
            action={action?.kind === 'sign' ? 'primary' : 'error'}
            disabled={busy || (action?.kind === 'refuse' && !text.trim())}
            onPress={submit}
          >
            {action?.kind === 'sign' ? 'Ký' : 'Xác nhận không ký'}
          </Button>
        }
      >
        <TextField
          label={action?.kind === 'sign' ? 'Ý kiến của tôi (không bắt buộc)' : 'Lý do tôi không ký'}
          value={text}
          onChangeText={setText}
          multiline
        />
      </Sheet>
    </Screen>
  );
}

import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';

import { AppHeader, Loading, Screen, SectionCard } from 'src/components/shared';
import { Badge, Button, Divider, Icon, Text } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import type { AgentActionView } from 'src/api/agent-actions';

import {
  actionParams,
  isActionable,
  isExpiringSoon,
  isResultSuccess,
  methodLabel,
  resultMessage,
  statusInfo,
  timeLeftText,
} from './agent-action-format';
import { DecisionSheet, type DecisionMode } from './DecisionSheet';
import { useAgentAction, useApproveAgentAction, useNow, useRejectAgentAction } from './hooks';

// ----------------------------------------------------------------------
// Chi tiết phiếu agent xin làm: đủ tham số, Duyệt (máy chủ chạy ngay, hiện kết quả) / Từ chối. Mở từ danh sách hoặc chạm
// thông báo (data.agentActionId). 409 = người khác vừa xử lý → nạp lại phiếu.
// ----------------------------------------------------------------------

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: 'error' | 'muted' }) {
  return (
    <View className="flex-row gap-3 py-1">
      <Text variant="caption" tone="muted" className="w-24">{label}</Text>
      <Text variant="bodySmall" tone={tone} className="flex-1" selectable>{value}</Text>
    </View>
  );
}

function ParamsCard({ action }: { action: AgentActionView }) {
  const params = actionParams(action.bodyJson);
  return (
    <SectionCard title="Tham số" icon="format-list-bulleted" bodyClassName="pt-0">
      {params === null ? (
        <Text variant="bodySmall" selectable>{action.bodyJson}</Text>
      ) : params.length === 0 ? (
        <Text variant="bodySmall" tone="muted">Lệnh không có tham số.</Text>
      ) : (
        params.map((p, i) => (
          <View key={`${p.key}-${i}`}>
            {i > 0 ? <Divider /> : null}
            <View className="py-2 gap-0.5">
              <Text variant="caption" tone="muted">{p.key}</Text>
              <Text variant="bodySmall" selectable>{p.value}</Text>
            </View>
          </View>
        ))
      )}
    </SectionCard>
  );
}

function ResultCard({ action }: { action: AgentActionView }) {
  const [showRaw, setShowRaw] = useState(false);
  const ran = action.status === 'executed' || action.status === 'failed';
  const ok = isResultSuccess(action);
  const message = resultMessage(action.resultBody);
  const decided = action.decidedAt || action.decidedByName;
  if (!decided && !ran) return null;

  return (
    <SectionCard title="Kết quả xử lý" icon="clipboard-check-outline" bodyClassName="pt-0 gap-2">
      {decided ? (
        <View>
          {action.decidedByName ? <InfoRow label="Người xử lý" value={action.decidedByName} /> : null}
          {action.decidedAt ? <InfoRow label="Lúc" value={dayjs(action.decidedAt).format('HH:mm DD/MM/YYYY')} /> : null}
          {action.decisionNote ? <InfoRow label="Ghi chú" value={action.decisionNote} /> : null}
        </View>
      ) : null}
      {ran ? (
        <View className={`flex-row gap-2 rounded-xl px-3 py-2.5 ${ok ? 'bg-success-soft' : 'bg-error-soft'}`}>
          <Icon name={ok ? 'check-circle-outline' : 'alert-circle-outline'} size={18} tone={ok ? 'success' : 'error'} />
          <View className="flex-1 gap-0.5">
            <Text variant="bodySmall" tone={ok ? 'success' : 'error'} className="font-semibold">
              {ok ? 'Đã chạy thành công' : 'Lệnh chạy bị lỗi'}
              {action.resultStatusCode ? ` (${action.resultStatusCode})` : ''}
            </Text>
            {action.executedAt ? (
              <Text variant="caption" tone="muted">{dayjs(action.executedAt).format('HH:mm:ss DD/MM/YYYY')}</Text>
            ) : null}
            {message && !ok ? <Text variant="caption" selectable>{message}</Text> : null}
          </View>
        </View>
      ) : null}
      {ran && action.resultBody ? (
        <>
          <Button size="sm" variant="ghost" action="neutral" fullWidth={false} icon={showRaw ? 'chevron-up' : 'code-json'} onPress={() => setShowRaw((v) => !v)}>
            {showRaw ? 'Ẩn phản hồi gốc' : 'Xem phản hồi gốc'}
          </Button>
          {showRaw ? (
            <Text variant="caption" tone="muted" selectable>{action.resultBody}</Text>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}

export function AgentActionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useAgentAction(id);
  const approveM = useApproveAgentAction();
  const rejectM = useRejectAgentAction();
  const [mode, setMode] = useState<DecisionMode | null>(null);
  const now = useNow(15_000);
  const action = query.data;
  const busy = approveM.isPending || rejectM.isPending;

  async function submit(note: string) {
    if (!action || !mode) return;
    try {
      if (mode === 'approve') {
        const result = await approveM.mutateAsync({ id: action.id, note });
        if (isResultSuccess(result)) {
          haptics.success();
          toast.success('Lệnh đã chạy thành công.', 'Đã duyệt');
        } else {
          haptics.error();
          toast.error(resultMessage(result.resultBody, 200) || 'Lệnh chạy bị lỗi.', 'Đã duyệt nhưng chạy lỗi');
        }
      } else {
        await rejectM.mutateAsync({ id: action.id, note });
        haptics.success();
        toast.success('Lệnh sẽ không chạy.', 'Đã từ chối');
      }
      setMode(null);
    } catch (e: any) {
      haptics.error();
      if (e?.status === 409 || e?.status === 404) {
        // Người khác vừa xử lý / phiếu hết hạn: đóng hộp, nạp lại để thấy trạng thái mới.
        setMode(null);
        query.refetch();
        toast.warning(extractApiError(e), 'Phiếu đã thay đổi');
      } else {
        toast.error(extractApiError(e), mode === 'approve' ? 'Chưa duyệt được' : 'Chưa từ chối được');
      }
    }
  }

  const status = action ? statusInfo(action.status) : null;
  const actionable = action ? isActionable(action, now) : false;
  const soon = action ? action.status === 'pending' && isExpiringSoon(action.expiresAt, now) : false;

  return (
    <Screen scroll tabBarInset={false} refreshing={query.isRefetching} onRefresh={query.refetch}>
      <AppHeader title="Phiếu agent xin làm" back />
      {query.isLoading ? (
        <Loading />
      ) : query.isError || !action ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error" className="text-center">
            Không tải được phiếu: {extractApiError(query.error)}
          </Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
        </View>
      ) : (
        <>
          <SectionCard title={action.agentName} icon="robot-outline" right={status ? <Badge tone={status.tone}>{status.label}</Badge> : null} bodyClassName="pt-0 gap-2">
            <Text variant="body" className="font-semibold" selectable>{action.summary}</Text>
            <View>
              <InfoRow label="Làm thay" value={action.actsForName ?? '—'} />
              <InfoRow label="Quyền" value={action.permission} />
              <InfoRow label="Việc" value={`${methodLabel(action.method)} · ${action.method.toUpperCase()} ${action.pathAndQuery}`} />
              <InfoRow label="Gửi lúc" value={dayjs(action.createdAt).format('HH:mm DD/MM/YYYY')} />
              <InfoRow
                label="Hết hạn"
                value={`${dayjs(action.expiresAt).format('HH:mm DD/MM/YYYY')}${action.status === 'pending' ? ` · ${timeLeftText(action.expiresAt, now)}` : ''}`}
                tone={soon || (action.status === 'pending' && !actionable) ? 'error' : undefined}
              />
            </View>
          </SectionCard>

          <ParamsCard action={action} />
          <ResultCard action={action} />

          {actionable ? (
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button variant="outline" action="error" icon="close-circle-outline" disabled={busy} onPress={() => setMode('reject')}>
                  Từ chối
                </Button>
              </View>
              <View className="flex-1">
                <Button icon="check-circle-outline" disabled={busy} onPress={() => setMode('approve')}>
                  Duyệt
                </Button>
              </View>
            </View>
          ) : action.status === 'pending' ? (
            <Text variant="caption" tone="muted" className="text-center">Phiếu đã quá hạn, không duyệt được nữa.</Text>
          ) : null}
        </>
      )}

      <DecisionSheet action={action ?? null} mode={mode} busy={busy} onClose={() => setMode(null)} onSubmit={submit} />
    </Screen>
  );
}

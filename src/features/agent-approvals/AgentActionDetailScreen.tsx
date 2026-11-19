import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';

import { AppHeader, Loading, Screen, SectionCard } from 'src/components/shared';
import { Badge, Button, Divider, Icon, Pressable, Text } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError, hasApiErrorCode } from 'src/services/error';
import type { AgentActionView } from 'src/api/agent-actions';
import { agentTaskRoute } from 'src/features/agent-tasks/agent-task-format';

import { ImageStrip, PreviewFields, SocialBatchPreview, SocialPostPreview } from './ActionPreview';
import {
  actionParams,
  actionTitle,
  canRequestRevision,
  isActionable,
  isExpiringSoon,
  isResultSuccess,
  methodLabel,
  resultMessage,
  revisionsLeftText,
  socialBatchOf,
  socialPostOf,
  splitRevisionNote,
  statusInfo,
  timeLeftText,
  versionLabel,
} from './agent-action-format';
import { DecisionSheet, type DecisionMode } from './DecisionSheet';
import { RevisionSheet } from './RevisionSheet';
import {
  useAgentAction,
  useApproveAgentAction,
  useNow,
  useRejectAgentAction,
  useRequestAgentActionRevision,
} from './hooks';

// ----------------------------------------------------------------------
// Chi tiết phiếu agent xin làm: bản xem trước dễ đọc (bài mạng xã hội như bài Threads thật / bảng nhãn — giá trị), bản
// trước khi đây là bản sửa, việc trên bảng việc mà phiếu thuộc về; Duyệt (máy chủ chạy ngay, hiện kết quả) / Yêu cầu sửa
// (agent làm lại rồi gửi bản mới) / Từ chối (agent dừng hẳn). Mở từ danh sách hoặc chạm thông báo (data.agentActionId).
// 409 = người khác vừa xử lý → nạp lại phiếu. Lệnh gốc (quyền, method, path, tham số) để dưới "Chi tiết kỹ thuật".
// ----------------------------------------------------------------------

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: 'error' | 'muted' }) {
  return (
    <View className="flex-row gap-3 py-1">
      <Text variant="caption" tone="muted" className="w-24">{label}</Text>
      <Text variant="bodySmall" tone={tone} className="flex-1" selectable>{value}</Text>
    </View>
  );
}

function ParamsList({ action }: { action: AgentActionView }) {
  const params = actionParams(action.bodyJson);
  if (params === null) return <Text variant="bodySmall" selectable>{action.bodyJson}</Text>;
  if (params.length === 0) return <Text variant="bodySmall" tone="muted">Lệnh không có tham số.</Text>;
  return (
    <View>
      {params.map((p, i) => (
        <View key={`${p.key}-${i}`}>
          {i > 0 ? <Divider /> : null}
          <View className="py-2 gap-0.5">
            <Text variant="caption" tone="muted">{p.key}</Text>
            <Text variant="bodySmall" selectable>{p.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Bản xem trước: bài mạng xã hội / bảng nhãn — giá trị; BE cũ không có preview → tham số đọc từ bodyJson. */
function PreviewCard({ action }: { action: AgentActionView }) {
  const post = socialPostOf(action);
  if (post) {
    return (
      <SectionCard title="Bài sẽ đăng" icon="post-outline">
        <SocialPostPreview post={post} />
      </SectionCard>
    );
  }
  const batch = socialBatchOf(action);
  if (batch) {
    return (
      <SectionCard title={`Lịch đăng (${batch.length} bài)`} icon="calendar-clock">
        <SocialBatchPreview items={batch} />
      </SectionCard>
    );
  }
  if (action.preview) {
    return (
      <SectionCard title="Nội dung" icon="format-list-bulleted" bodyClassName="pt-0">
        <PreviewFields fields={action.preview.fields ?? []} />
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Tham số" icon="format-list-bulleted" bodyClassName="pt-0">
      <ParamsList action={action} />
    </SectionCard>
  );
}

/** Ghi chú yêu cầu sửa: chữ + ảnh cần làm lại (không in URL). */
function RevisionNote({ note, by }: { note: string | null | undefined; by?: string | null }) {
  const { text, imageUrls } = splitRevisionNote(note);
  if (!text && imageUrls.length === 0) return null;
  return (
    <View className="gap-2 rounded-xl bg-secondary-soft px-3 py-2.5">
      <View className="flex-row gap-2">
        <Icon name="pencil-outline" size={16} tone="secondary" />
        <View className="flex-1 gap-0.5">
          <Text variant="caption" tone="muted">{by ? `${by} yêu cầu sửa` : 'Yêu cầu sửa'}</Text>
          {text ? <Text variant="bodySmall" selectable>{text}</Text> : null}
        </View>
      </View>
      {imageUrls.length > 0 ? (
        <View className="gap-1">
          <Text variant="caption" tone="muted">Ảnh cần làm lại ({imageUrls.length})</Text>
          <ImageStrip urls={imageUrls} width={72} height={72} />
        </View>
      ) : null}
    </View>
  );
}

/** Bản trước (bị yêu cầu sửa): ghi chú của người duyệt + chữ / ảnh cũ để so với bản này. */
function PreviousCard({ action }: { action: AgentActionView }) {
  const previous = action.previous;
  if (!previous) return null;
  const post = socialPostOf(previous);
  const redo = splitRevisionNote(previous.note).imageUrls;
  return (
    <SectionCard title="Bản trước" icon="history" collapsible defaultExpanded={false} bodyClassName="pt-0 gap-3">
      <RevisionNote note={previous.note} by={previous.decidedByName} />
      {post ? (
        <>
          {post.text?.trim() ? (
            <View className="gap-0.5">
              <Text variant="caption" tone="muted">Chữ bản trước</Text>
              <Text variant="bodySmall" tone="muted" selectable>{post.text.trim()}</Text>
            </View>
          ) : null}
          {post.imageUrls.length > 0 ? (
            <View className="gap-1">
              <Text variant="caption" tone="muted">Ảnh bản trước</Text>
              <ImageStrip urls={post.imageUrls} width={140} height={175} marked={redo} />
            </View>
          ) : null}
          {post.modeLabel ? <Text variant="caption" tone="muted">Lịch bản trước: {post.modeLabel}</Text> : null}
        </>
      ) : previous.preview ? (
        <PreviewFields fields={previous.preview.fields ?? []} />
      ) : null}
    </SectionCard>
  );
}

function TechnicalCard({ action }: { action: AgentActionView }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <SectionCard title="Chi tiết kỹ thuật" icon="code-braces" collapsible defaultExpanded={false} bodyClassName="pt-0 gap-2">
      <View>
        <InfoRow label="Quyền" value={action.permission} />
        <InfoRow label="Việc" value={`${methodLabel(action.method)} · ${action.method.toUpperCase()} ${action.pathAndQuery}`} />
        {action.summary ? <InfoRow label="Tóm tắt gốc" value={action.summary} /> : null}
      </View>
      {action.preview ? (
        <>
          <Divider />
          <Text variant="caption" tone="muted">Tham số gửi lên</Text>
          <ParamsList action={action} />
        </>
      ) : null}
      {action.bodyJson ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            action="neutral"
            fullWidth={false}
            icon={showRaw ? 'chevron-up' : 'code-json'}
            onPress={() => setShowRaw((v) => !v)}
          >
            {showRaw ? 'Ẩn JSON gốc' : 'Xem JSON gốc'}
          </Button>
          {showRaw ? <Text variant="caption" tone="muted" selectable>{action.bodyJson}</Text> : null}
        </>
      ) : null}
    </SectionCard>
  );
}

function ResultCard({ action }: { action: AgentActionView }) {
  const [showRaw, setShowRaw] = useState(false);
  const ran = action.status === 'executed' || action.status === 'failed';
  const ok = isResultSuccess(action);
  const message = resultMessage(action.resultBody);
  const decided = action.decidedAt || action.decidedByName;
  const revision = action.status === 'revision_requested';
  if (!decided && !ran) return null;

  return (
    <SectionCard title="Kết quả xử lý" icon="clipboard-check-outline" bodyClassName="pt-0 gap-2">
      {decided ? (
        <View>
          {action.decidedByName ? <InfoRow label="Người xử lý" value={action.decidedByName} /> : null}
          {action.decidedAt ? <InfoRow label="Lúc" value={dayjs(action.decidedAt).format('HH:mm DD/MM/YYYY')} /> : null}
          {action.decisionNote && !revision ? <InfoRow label="Ghi chú" value={action.decisionNote} /> : null}
        </View>
      ) : null}
      {revision ? (
        <>
          <RevisionNote note={action.decisionNote} />
          <Text variant="caption" tone="muted">Lệnh không chạy. Agent đang sửa và sẽ gửi bản mới thành phiếu khác.</Text>
        </>
      ) : null}
      {action.status === 'rejected' ? (
        <Text variant="caption" tone="muted">Lệnh không chạy, agent đã dừng việc này.</Text>
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
  const revisionM = useRequestAgentActionRevision();
  const [mode, setMode] = useState<DecisionMode | null>(null);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const now = useNow(15_000);
  const action = query.data;
  const busy = approveM.isPending || rejectM.isPending || revisionM.isPending;

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
        toast.success('Agent sẽ dừng việc này.', 'Đã từ chối');
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

  function openRevision() {
    setRevisionError(null);
    setRevisionOpen(true);
  }

  async function submitRevision(input: { note: string; imageUrls: string[] }) {
    if (!action) return;
    setRevisionError(null);
    try {
      await revisionM.mutateAsync({ id: action.id, note: input.note, imageUrls: input.imageUrls });
      haptics.success();
      toast.success('Agent sẽ sửa rồi gửi bản mới để bạn duyệt.', 'Đã yêu cầu sửa');
      setRevisionOpen(false);
    } catch (e: any) {
      haptics.error();
      const message = extractApiError(e);
      if (hasApiErrorCode(e, 'AgentAction.RevisionLimit')) {
        // Hết lượt sửa: giữ hộp mở để thấy câu của máy chủ, nạp lại để khoá nút.
        setRevisionError(message);
        query.refetch();
      } else if (e?.status === 409 || e?.status === 404) {
        setRevisionOpen(false);
        query.refetch();
        toast.warning(message, 'Phiếu đã thay đổi');
      } else {
        setRevisionError(message);
      }
    }
  }

  const status = action ? statusInfo(action.status) : null;
  const actionable = action ? isActionable(action, now) : false;
  const soon = action ? action.status === 'pending' && isExpiringSoon(action.expiresAt, now) : false;
  const version = action ? versionLabel(action.version) : null;
  const revisionAllowed = action ? canRequestRevision(action) : false;
  const leftText = action ? revisionsLeftText(action.revisionsLeft) : '';

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
            <View className="flex-row items-start gap-2">
              <Text variant="body" className="font-semibold flex-1" selectable>{actionTitle(action)}</Text>
              {version ? <Badge tone="secondary" icon="history">{version}</Badge> : null}
            </View>
            {action.taskId ? (
              <Pressable
                onPress={() => router.push(agentTaskRoute(action.taskId!) as any)}
                accessibilityRole="link"
                accessibilityLabel={`Mở việc ${action.taskTitle ?? ''}`}
                className="flex-row items-center gap-2 rounded-xl bg-ink/5 dark:bg-white/5 px-3 py-2"
              >
                <Icon name="clipboard-text-outline" size={16} tone="primary" />
                <Text variant="bodySmall" className="flex-1" numberOfLines={2}>
                  <Text variant="bodySmall" tone="muted">Thuộc việc: </Text>
                  {action.taskTitle || 'Việc trên bảng việc'}
                </Text>
                <Icon name="chevron-right" size={18} tone="muted" />
              </Pressable>
            ) : null}
            <View>
              <InfoRow label="Làm thay" value={action.actsForName ?? '—'} />
              <InfoRow label="Gửi lúc" value={dayjs(action.createdAt).format('HH:mm DD/MM/YYYY')} />
              <InfoRow
                label="Hết hạn"
                value={`${dayjs(action.expiresAt).format('HH:mm DD/MM/YYYY')}${action.status === 'pending' ? ` · ${timeLeftText(action.expiresAt, now)}` : ''}`}
                tone={soon || (action.status === 'pending' && !actionable) ? 'error' : undefined}
              />
            </View>
          </SectionCard>

          <PreviewCard action={action} />
          <PreviousCard action={action} />
          <ResultCard action={action} />
          <TechnicalCard action={action} />

          {actionable ? (
            <View className="gap-2">
              <Button icon="check-circle-outline" disabled={busy} onPress={() => setMode('approve')}>
                Duyệt
              </Button>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button variant="outline" action="neutral" icon="pencil-outline" disabled={busy || !revisionAllowed} onPress={openRevision}>
                    Yêu cầu sửa
                  </Button>
                </View>
                <View className="flex-1">
                  <Button variant="outline" action="error" icon="close-circle-outline" disabled={busy} onPress={() => setMode('reject')}>
                    Từ chối
                  </Button>
                </View>
              </View>
              {leftText ? (
                <Text variant="caption" tone={revisionAllowed ? 'muted' : 'error'} className="text-center">
                  {revisionAllowed ? leftText : `${leftText} — hãy Duyệt hoặc Từ chối.`}
                </Text>
              ) : null}
            </View>
          ) : action.status === 'pending' ? (
            <Text variant="caption" tone="muted" className="text-center">Phiếu đã quá hạn, không duyệt được nữa.</Text>
          ) : null}
        </>
      )}

      <DecisionSheet action={action ?? null} mode={mode} busy={busy} onClose={() => setMode(null)} onSubmit={submit} />
      <RevisionSheet
        action={action ?? null}
        visible={revisionOpen}
        busy={revisionM.isPending}
        error={revisionError}
        onClose={() => setRevisionOpen(false)}
        onSubmit={submitRevision}
      />
    </Screen>
  );
}

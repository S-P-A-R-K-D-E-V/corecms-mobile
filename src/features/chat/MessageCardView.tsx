import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import dayjs from 'dayjs';

import { Sheet } from 'src/components/shared';
import { Badge, Button, Icon, Pressable, Spinner, Text, TextField } from 'src/components/ui';
import { confirm, toast } from 'src/components/overlay';
import { cn } from 'src/components/ui/utils';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';
import { useAuthContext } from 'src/auth/auth-context';
import { canApproveAgentActions } from 'src/auth/permissions';
import type { MessageCard, MessageCardAction } from 'src/api/messenger';
import { ActionPreviewContent } from 'src/features/agent-approvals/ActionPreview';
import { isResultSuccess, resultMessage, timeLeftText } from 'src/features/agent-approvals/agent-action-format';
import {
  useAgentAction,
  useApproveAgentAction,
  useCancelAgentProposal,
  useConfirmAgentProposal,
  useNow,
  useRejectAgentAction,
  useRequestAgentActionRevision,
} from 'src/features/agent-approvals/hooks';
import {
  CARD_NOTE_MAX,
  CARD_REPLY_MAX,
  cardActionLook,
  cardErrorInfo,
  cardKindInfo,
  cardOpenLabel,
  cardState,
  cardStatusText,
  cardTargetRoute,
  confirmPromptText,
  confirmResultInfo,
  isApprovalCard,
  parseCardTime,
  visibleCardActions,
} from 'src/features/agent-approvals/message-card-format';
import { useAddAgentTaskNote } from 'src/features/agent-tasks/hooks';

// ----------------------------------------------------------------------
// Thẻ hành động trong nhóm "Quản trị – Đội agent" (hợp đồng docs/cici/plans/a1-nhom-quan-tri-api-contract.md mục 2):
// phiếu agent xin duyệt / việc agent đang hỏi / việc lỗi / kết quả việc. Nút gọi đúng API của màn Duyệt / Việc của agent
// bằng phiên của người bấm; người không có agent.approve chỉ thấy nút Mở. Thẻ đổi trạng thái tới qua sự kiện
// messageUpdated (messenger-provider). 409 / 404 → báo câu của máy chủ rồi nạp lại thẻ; 403 → không có quyền.
// A2 (a2-agent-ceo-api-contract.md mục 3): thẻ `confirm` — CEO đề xuất thao tác; Xác nhận hỏi lại "Chạy {n} thao tác này?"
// rồi POST agent-center/admin-group/confirm/{refId}; Huỷ → …/cancel. Thẻ tự đổi qua messageUpdated, ở đây chỉ báo kết quả.
// ----------------------------------------------------------------------

type InputMode = 'revise' | 'reject' | 'reply';

function CardInputSheet({
  mode,
  title,
  busy,
  onClose,
  onSubmit,
}: {
  mode: InputMode | null;
  title: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (mode) setText('');
  }, [mode]);

  const required = mode === 'revise' || mode === 'reply';
  const canSend = !busy && (!required || text.trim().length > 0);
  const copy =
    mode === 'revise'
      ? { title: t('chat.card.reviseTitle'), hint: t('chat.card.reviseHint'), label: t('chat.card.reviseLabel'), send: t('chat.card.reviseSend'), max: CARD_NOTE_MAX }
      : mode === 'reject'
        ? { title: t('chat.card.rejectTitle'), hint: t('chat.card.rejectHint'), label: t('chat.card.rejectLabel'), send: t('chat.card.rejectSend'), max: CARD_NOTE_MAX }
        : { title: t('chat.card.replyTitle'), hint: t('chat.card.replyHint'), label: t('chat.card.replyLabel'), send: t('chat.card.replySend'), max: CARD_REPLY_MAX };

  return (
    <Sheet
      visible={!!mode}
      title={copy.title}
      onClose={busy ? () => {} : onClose}
      footer={
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button variant="outline" action="neutral" disabled={busy} onPress={onClose}>
              {t('common.cancel')}
            </Button>
          </View>
          <View className="flex-1">
            <Button
              action={mode === 'reject' ? 'error' : 'primary'}
              icon={mode === 'reject' ? 'close-circle-outline' : mode === 'revise' ? 'pencil-outline' : 'send'}
              loading={busy}
              disabled={!canSend}
              onPress={() => onSubmit(text)}
            >
              {copy.send}
            </Button>
          </View>
        </View>
      }
    >
      <Text variant="body" className="font-semibold">{title}</Text>
      <View className={cn('flex-row gap-2 rounded-xl px-3 py-2.5', mode === 'reject' ? 'bg-error-soft' : 'bg-ink/5 dark:bg-white/5')}>
        <Icon name={mode === 'reject' ? 'stop-circle-outline' : 'information-outline'} size={18} tone={mode === 'reject' ? 'error' : 'muted'} />
        <Text variant="caption" tone={mode === 'reject' ? 'error' : 'muted'} className="flex-1">{copy.hint}</Text>
      </View>
      <TextField
        label={copy.label}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={copy.max}
        editable={!busy}
      />
    </Sheet>
  );
}

/** Bản xem trước của phiếu (GET agent-actions/{refId}) — dùng lại khối xem trước của màn Duyệt. */
function ApprovalPreview({ refId }: { refId: string }) {
  const query = useAgentAction(refId);
  if (query.isLoading) {
    return (
      <View className="py-3 items-center">
        <Spinner />
      </View>
    );
  }
  if (query.isError || !query.data) {
    return <Text variant="caption" tone="error">{t('chat.card.previewFailed', { error: extractApiError(query.error) })}</Text>;
  }
  return <ActionPreviewContent action={query.data} />;
}

export function MessageCardView({
  card,
  createdAt,
  senderName,
  onReload,
}: {
  card: MessageCard;
  createdAt: string;
  senderName: string;
  /** Nạp lại thẻ sau 409 / 404 (phiếu đã xử lý / hết hạn ở chỗ khác). */
  onReload: () => void;
}) {
  const { user } = useAuthContext();
  const canApprove = canApproveAgentActions(user);
  const now = useNow(30_000);
  const approveM = useApproveAgentAction();
  const rejectM = useRejectAgentAction();
  const revisionM = useRequestAgentActionRevision();
  const noteM = useAddAgentTaskNote();
  const confirmM = useConfirmAgentProposal();
  const cancelM = useCancelAgentProposal();
  const [mode, setMode] = useState<InputMode | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const state = cardState(card, now);
  const statusText = cardStatusText(card, now);
  const actions = visibleCardActions(card, { canApprove, now });
  const kind = cardKindInfo(card.kind);
  const approval = isApprovalCard(card);
  const busy =
    approveM.isPending || rejectM.isPending || revisionM.isPending || noteM.isPending || confirmM.isPending || cancelM.isPending;
  const expires = parseCardTime(card.expiresAt);
  const expiresIso = expires !== null ? new Date(expires).toISOString() : null;

  function openTarget() {
    router.push(cardTargetRoute(card) as any);
  }

  function fail(e: unknown) {
    haptics.error();
    const info = cardErrorInfo(e);
    if (info.changed) {
      setMode(null);
      toast.warning(info.message, t('chat.card.changedTitle'));
    } else {
      toast.error(info.message, t('chat.card.failedTitle'));
    }
    if (info.reload) onReload();
  }

  async function approve() {
    const ok = await confirm({
      title: t('chat.card.approveTitle'),
      message: t('chat.card.approveMessage', { title: card.title }),
      confirmText: t('chat.card.approveConfirm'),
    });
    if (!ok) return;
    try {
      const result = await approveM.mutateAsync({ id: card.refId });
      if (isResultSuccess(result)) {
        haptics.success();
        toast.success(t('chat.card.approvedOk'), t('chat.card.approvedTitle'));
      } else {
        haptics.error();
        toast.error(resultMessage(result.resultBody, 200) || t('chat.card.approvedFailed'), t('chat.card.approvedFailedTitle'));
      }
    } catch (e) {
      fail(e);
    }
  }

  async function confirmProposal() {
    const ok = await confirm({
      title: t('chat.card.confirmTitle'),
      message: `${confirmPromptText(card)}\n\n${t('chat.card.confirmHint')}`,
      confirmText: t('chat.card.confirmConfirm'),
    });
    if (!ok) return;
    try {
      const result = await confirmM.mutateAsync(card.refId);
      const info = confirmResultInfo(result, t('chat.card.confirmedOk'));
      if (info.ok) {
        haptics.success();
        toast.success(info.message, t('chat.card.confirmedTitle'));
      } else {
        haptics.error();
        toast.warning(info.message, t('chat.card.confirmedPartialTitle'));
      }
    } catch (e) {
      fail(e);
    }
  }

  async function cancelProposal() {
    const ok = await confirm({
      title: t('chat.card.cancelProposalTitle'),
      message: t('chat.card.cancelProposalMessage'),
      confirmText: t('chat.card.cancelProposalConfirm'),
      destructive: true,
    });
    if (!ok) return;
    try {
      const result = await cancelM.mutateAsync(card.refId);
      haptics.success();
      toast.success(confirmResultInfo(result, t('chat.card.cancelledOk')).message, t('chat.card.cancelledTitle'));
    } catch (e) {
      fail(e);
    }
  }

  async function submitInput(text: string) {
    if (!mode) return;
    try {
      if (mode === 'revise') {
        await revisionM.mutateAsync({ id: card.refId, note: text });
        toast.success(t('chat.card.revisedOk'), t('chat.card.revisedTitle'));
      } else if (mode === 'reject') {
        await rejectM.mutateAsync({ id: card.refId, note: text });
        toast.success(t('chat.card.rejectedOk'), t('chat.card.rejectedTitle'));
      } else {
        await noteM.mutateAsync({ id: card.refId, text: text.slice(0, CARD_REPLY_MAX) });
        toast.success(t('chat.card.repliedOk'), t('chat.card.repliedTitle'));
      }
      haptics.success();
      setMode(null);
    } catch (e) {
      fail(e);
    }
  }

  function press(action: MessageCardAction) {
    if (busy) return;
    switch (action.key) {
      case 'approve':
        approve();
        break;
      case 'confirm':
        confirmProposal();
        break;
      case 'cancel':
        cancelProposal();
        break;
      case 'revise':
      case 'reject':
      case 'reply':
        setMode(action.key as InputMode);
        break;
      default:
        openTarget();
    }
  }

  return (
    <View className="flex-row justify-start my-1">
      <View
        className={cn(
          'w-[88%] rounded-2xl px-3.5 py-3 gap-2 border bg-surface dark:bg-surface-dark',
          state === 'open' ? 'border-line dark:border-line-dark' : 'border-line/60 dark:border-line-dark'
        )}
      >
        <View className="flex-row items-center gap-2">
          <Icon name={kind.icon} size={16} tone={state === 'open' ? kind.tone : 'muted'} />
          <Text variant="caption" tone="muted" className="flex-1 font-semibold" numberOfLines={1}>
            {senderName} · {kind.label}
          </Text>
          <Text className="text-[10px] text-faint">{dayjs(createdAt).format('HH:mm')}</Text>
        </View>

        <Pressable onPress={openTarget} accessibilityRole="link" accessibilityLabel={`${cardOpenLabel(card)}: ${card.title}`}>
          <View className="flex-row items-start gap-1">
            <Text variant="body" className={cn('font-semibold flex-1', state !== 'open' && 'text-muted')}>
              {card.title || cardOpenLabel(card)}
            </Text>
            <Icon name="chevron-right" size={18} tone="muted" />
          </View>
        </Pressable>

        {card.lines.length > 0 ? (
          <View className="gap-0.5">
            {card.lines.map((line, i) => (
              <Text key={`${i}-${line}`} variant="bodySmall" tone={state === 'open' ? 'default' : 'muted'} selectable>
                {line}
              </Text>
            ))}
          </View>
        ) : null}

        {statusText ? (
          <Badge tone={state === 'expired' ? 'neutral' : 'success'} icon={state === 'expired' ? 'timer-sand-complete' : 'check'}>
            {statusText}
          </Badge>
        ) : approval && expiresIso ? (
          <Text variant="caption" tone="muted">{t('chat.card.expiresIn', { left: timeLeftText(expiresIso, now) })}</Text>
        ) : null}

        {approval && state === 'open' ? (
          <View className="gap-2">
            <Pressable onPress={() => setShowPreview((v) => !v)} className="flex-row items-center gap-1 self-start py-1">
              <Icon name={showPreview ? 'chevron-up' : 'eye-outline'} size={16} tone="primary" />
              <Text variant="caption" tone="primary" className="font-semibold">
                {showPreview ? t('chat.card.hidePreview') : t('chat.card.preview')}
              </Text>
            </Pressable>
            {showPreview ? (
              <View className="rounded-xl bg-bg dark:bg-bg-dark p-2.5">
                <ApprovalPreview refId={card.refId} />
              </View>
            ) : null}
          </View>
        ) : null}

        {actions.length > 0 ? (
          <View className="flex-row flex-wrap gap-2 pt-1">
            {actions.map((action) => {
              const look = cardActionLook(action.style);
              return (
                <Button
                  key={action.key}
                  size="sm"
                  variant={look.variant}
                  action={look.action}
                  fullWidth={false}
                  disabled={busy}
                  loading={
                    (action.key === 'approve' && approveM.isPending) ||
                    (action.key === 'confirm' && confirmM.isPending) ||
                    (action.key === 'cancel' && cancelM.isPending)
                  }
                  onPress={() => press(action)}
                >
                  {action.label}
                </Button>
              );
            })}
          </View>
        ) : null}
      </View>

      <CardInputSheet
        mode={mode}
        title={card.title}
        busy={revisionM.isPending || rejectM.isPending || noteM.isPending}
        onClose={() => setMode(null)}
        onSubmit={submitInput}
      />
    </View>
  );
}

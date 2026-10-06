import { View } from 'react-native';
import dayjs from 'dayjs';

import { Text, Icon, Pressable, Divider, Spinner } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { t } from 'src/i18n';
import type { IOpenOrder, IOrderLine } from 'src/types/fnb';

import { money } from 'src/features/erp/shared';
import { QtyStepper } from 'src/features/pos/CartPanel';
import { draftAmount, type DraftLine } from './draft';
import { billOutdated, lineTitle, pendingLines, roundsOf } from './order-view';
import type { QueueEntry } from './write-queue';

// ----------------------------------------------------------------------
// Nội dung đơn (dùng cho khung phải trên tablet và bảng trượt trên điện thoại), từ trên xuống:
//   lệnh cần xử lý → món đang chọn → món đang gửi → món chưa gửi bar → các lượt đã gửi → tạm tính / tổng.
// ----------------------------------------------------------------------

function Extras({ toppings, quickNotes, note }: { toppings: { name: string; quantity: number }[]; quickNotes: string[]; note: string | null }) {
  const parts = [
    ...toppings.map((tp) => (tp.quantity > 1 ? `+ ${tp.name} ×${tp.quantity}` : `+ ${tp.name}`)),
    ...quickNotes,
    ...(note ? [note] : []),
  ];
  if (!parts.length) return null;
  return <Text variant="caption" tone="muted" numberOfLines={3}>{parts.join(' · ')}</Text>;
}

function SectionTitle({ icon, label, right, tone = 'muted' }: { icon: any; label: string; right?: string; tone?: 'muted' | 'primary' | 'warning' }) {
  return (
    <View className="flex-row items-center gap-1.5 pt-3 pb-1">
      <Icon name={icon} size={15} tone={tone} />
      <Text variant="label" tone={tone} className="flex-1">{label}</Text>
      {right ? <Text variant="caption" tone="muted">{right}</Text> : null}
    </View>
  );
}

function ServerLine({ line, onPress, right }: { line: IOrderLine; onPress?: () => void; right?: React.ReactNode }) {
  const voided = line.quantity === 0;
  return (
    <Pressable disabled={!onPress} onPress={onPress} className="flex-row items-start gap-2 py-1.5">
      <Text className={cn('w-8 font-bold', voided && 'line-through')} tone={voided ? 'faint' : 'default'} style={{ fontVariant: ['tabular-nums'] }}>
        {voided ? line.orderedQuantity : line.quantity}×
      </Text>
      <View className="flex-1">
        <Text variant="bodySmall" className={cn('font-semibold', voided && 'line-through')} tone={voided ? 'faint' : 'default'}>
          {lineTitle(line)}
        </Text>
        <Extras toppings={line.toppings} quickNotes={line.quickNotes} note={line.note} />
        {line.voidedQuantity > 0 ? <Text variant="caption" tone="error">{t('fnb.voidedQty', { n: line.voidedQuantity })}</Text> : null}
      </View>
      {right ?? <Text variant="bodySmall" className="font-semibold" tone={voided ? 'faint' : 'default'}>{money(line.amount)}</Text>}
    </Pressable>
  );
}

export function OrderPanel({
  order,
  drafts,
  outbox,
  attention,
  onDraftQty,
  onRemovePending,
  onVoidLine,
  onDiscardAttention,
}: {
  order: IOpenOrder | undefined;
  drafts: DraftLine[];
  outbox: { draft: DraftLine; state: QueueEntry['state'] }[];
  attention: QueueEntry[];
  onDraftQty: (id: string, qty: number) => void;
  onRemovePending: (line: IOrderLine) => void;
  onVoidLine: (line: IOrderLine) => void;
  onDiscardAttention: () => void;
}) {
  const rounds = roundsOf(order);
  const pending = pendingLines(order);
  const empty = !drafts.length && !outbox.length && !pending.length && !rounds.length;
  const rejected = attention.find((e) => !e.error?.blockedBy);

  return (
    <View>
      {rejected ? (
        <View className="rounded-2xl bg-error-soft px-3.5 py-3 gap-2 mt-1">
          <View className="flex-row items-start gap-2">
            <Icon name="alert-circle-outline" size={18} tone="error" />
            <View className="flex-1">
              <Text variant="bodySmall" tone="error" className="font-semibold">{rejected.error?.title || t('fnb.commandFailed')}</Text>
              <Text variant="caption" tone="muted">{t('fnb.attentionHint', { n: attention.length })}</Text>
            </View>
          </View>
          <Pressable onPress={onDiscardAttention} className="self-end px-3 py-1.5 rounded-xl bg-error">
            <Text variant="caption" tone="inverse" className="font-bold">{t('fnb.discard')}</Text>
          </Pressable>
        </View>
      ) : null}

      {empty ? (
        <View className="items-center py-10 gap-2">
          <Icon name="silverware-fork-knife" size={36} tone="faint" />
          <Text variant="bodySmall" tone="muted" className="text-center">{t('fnb.emptyOrder')}</Text>
        </View>
      ) : null}

      {drafts.length ? (
        <>
          <SectionTitle icon="cart-outline" label={t('fnb.drafts')} tone="primary" />
          {drafts.map((d, i) => (
            <View key={d.id}>
              {i > 0 ? <Divider /> : null}
              <View className="flex-row items-center gap-2 py-2">
                <View className="flex-1">
                  <Text variant="bodySmall" className="font-semibold">{lineTitle(d)}</Text>
                  <Extras toppings={d.toppings} quickNotes={d.quickNotes} note={d.note} />
                  <Text variant="caption" tone="muted">{money(draftAmount(d))}</Text>
                </View>
                <QtyStepper value={d.quantity} onChange={(n) => onDraftQty(d.id, n)} />
              </View>
            </View>
          ))}
        </>
      ) : null}

      {outbox.length ? (
        <>
          <SectionTitle icon="timer-sand" label={t('fnb.sending')} tone="warning" />
          {outbox.map(({ draft, state }) => (
            <View key={draft.id} className="flex-row items-start gap-2 py-1.5 opacity-70">
              <Text className="w-8 font-bold">{draft.quantity}×</Text>
              <View className="flex-1">
                <Text variant="bodySmall" className="font-semibold">{lineTitle(draft)}</Text>
                <Extras toppings={draft.toppings} quickNotes={draft.quickNotes} note={draft.note} />
              </View>
              {state === 'attention' ? <Icon name="alert-circle-outline" size={18} tone="error" /> : <Spinner size="small" />}
            </View>
          ))}
        </>
      ) : null}

      {pending.length ? (
        <>
          <SectionTitle icon="pause-circle-outline" label={t('fnb.pending')} tone="warning" />
          {pending.map((l) => (
            <ServerLine
              key={l.id}
              line={l}
              right={
                <Pressable onPress={() => onRemovePending(l)} hitSlop={8} accessibilityLabel={t('fnb.removeLine')}>
                  <Icon name="trash-can-outline" size={18} tone="error" />
                </Pressable>
              }
            />
          ))}
        </>
      ) : null}

      {rounds.map((r) => (
        <View key={r.ticketId}>
          <SectionTitle icon="glass-cocktail" label={t('fnb.round', { n: r.no })} right={r.sentAt ? dayjs(r.sentAt).format('HH:mm') : undefined} />
          {r.lines.map((l) => (
            <ServerLine key={l.id} line={l} onPress={l.status === 'Sent' && l.quantity > 0 ? () => onVoidLine(l) : undefined} />
          ))}
        </View>
      ))}

      {order && order.lines.length ? (
        <View className="mt-3 pt-2 border-t border-line/70 dark:border-line-dark gap-1">
          {order.totals.discountAmount > 0 ? (
            <>
              <View className="flex-row justify-between">
                <Text variant="bodySmall" tone="muted">{t('fnb.subtotal')}</Text>
                <Text variant="bodySmall">{money(order.totals.subtotal)}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text variant="bodySmall" tone="muted">{t('fnb.discount')}</Text>
                <Text variant="bodySmall" tone="success">−{money(order.totals.discountAmount)}</Text>
              </View>
            </>
          ) : null}
          <View className="flex-row justify-between items-center">
            <Text variant="headline">{t('fnb.total')}</Text>
            <Text variant="title2" tone="primary" style={{ fontVariant: ['tabular-nums'] }}>{money(order.totals.total)}</Text>
          </View>
          {billOutdated(order) ? (
            <Text variant="caption" tone="warning">{t('fnb.billOutdated', { amount: money(order.bill!.lastTotal) })}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

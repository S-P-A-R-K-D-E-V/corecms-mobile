import { View } from 'react-native';
import dayjs from 'dayjs';

import { Card, Text, Badge, Button, Divider } from 'src/components/ui';
import { showActionSheet } from 'src/components/overlay';
import { fmtMoney } from 'src/features/schedule/constants';
import {
  SUPPORT_CLAIM_STATUS_LABEL,
  type ISupportShiftClaim,
  type ISupportShiftOpening,
  type SupportShiftClaimStatus,
} from 'src/types/hr';

// ----------------------------------------------------------------------
// Ca hỗ trợ mở trên chợ ca: quản lý đăng trên web khi đông khách; ai rảnh thì nhận, được duyệt là ca vào lịch.
// Quản lý (shift.assignment.manage) thấy mọi đơn nhận và duyệt / từ chối ngay trên app.
// ----------------------------------------------------------------------

const CLAIM_TONE: Record<SupportShiftClaimStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'error',
  Withdrawn: 'neutral',
};

const hhmm = (t: string) => t.slice(0, 5);

/** "38.500 ₫/giờ · trả tối thiểu 1,5 giờ" hoặc trả theo lương giờ. */
export function supportPayText(o: Pick<ISupportShiftOpening, 'fixedHourlyRate' | 'minimumPaidHours'>): string {
  if (!o.fixedHourlyRate) return 'Trả theo lương giờ của bạn';
  const min = o.minimumPaidHours ? ` · trả tối thiểu ${String(o.minimumPaidHours).replace('.', ',')} giờ` : '';
  return `${fmtMoney(o.fixedHourlyRate)}/giờ${min}`;
}

type Props = {
  opening: ISupportShiftOpening;
  userId?: string;
  canManage: boolean;
  busy: boolean;
  onClaim: (o: ISupportShiftOpening) => void;
  onWithdraw: (claim: ISupportShiftClaim) => void;
  onReview: (claim: ISupportShiftClaim, approve: boolean, note?: string) => void;
};

export function SupportShiftCard({ opening: o, userId, canManage, busy, onClaim, onWithdraw, onReview }: Props) {
  const mine = o.claims.find((c) => c.staffId === userId);
  const myActive = mine && (mine.status === 'Pending' || mine.status === 'Approved');
  const started = dayjs(`${o.date.slice(0, 10)} ${o.startTime}`).isBefore(dayjs());
  const others = canManage ? o.claims.filter((c) => c.staffId !== userId) : [];

  const review = (c: ISupportShiftClaim) =>
    showActionSheet({
      title: c.staffName,
      message: `Nhận ${o.shiftName} ${hhmm(o.startTime)}–${hhmm(o.endTime)} ngày ${dayjs(o.date).format('DD/MM')}.`,
      options: [
        { label: 'Duyệt — ca vào lịch', icon: 'check-circle', onPress: () => onReview(c, true) },
        { label: 'Từ chối — đã đủ người', icon: 'close-circle', destructive: true, onPress: () => onReview(c, false, 'Đã đủ người.') },
        { label: 'Từ chối — không phù hợp', icon: 'close-circle', destructive: true, onPress: () => onReview(c, false, 'Không phù hợp ca này.') },
      ],
    });

  return (
    <Card className="p-4 gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text variant="subtitle">Ca hỗ trợ · {o.shiftName}</Text>
        <Badge tone={o.status === 'Open' ? 'info' : o.status === 'Filled' ? 'success' : 'neutral'}>
          {`${o.approvedCount}/${o.slots} người`}
        </Badge>
      </View>
      <Text variant="bodySmall" tone="muted">
        {dayjs(o.date).format('DD/MM/YYYY')} · {hhmm(o.startTime)} – {hhmm(o.endTime)}
      </Text>
      <Text variant="bodySmall" tone="primary" className="font-semibold">{supportPayText(o)}</Text>
      {o.note ? <Text variant="bodySmall" tone="muted">{o.note}</Text> : null}
      {mine ? (
        <Text variant="caption" tone="muted">
          Đơn của bạn: {SUPPORT_CLAIM_STATUS_LABEL[mine.status]}
          {mine.reviewNote ? ` · ${mine.reviewNote}` : ''}
        </Text>
      ) : null}

      {others.length > 0 ? (
        <View className="gap-1 mt-1">
          {others.map((c) => (
            <View key={c.id} className="flex-row items-center justify-between gap-2">
              <Text variant="bodySmall" className="flex-1" numberOfLines={1}>{c.staffName}</Text>
              {c.status === 'Pending' && o.status === 'Open' ? (
                <Button size="sm" variant="outline" fullWidth={false} disabled={busy} onPress={() => review(c)}>Duyệt</Button>
              ) : (
                <Badge tone={CLAIM_TONE[c.status]}>{SUPPORT_CLAIM_STATUS_LABEL[c.status]}</Badge>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {o.status === 'Open' && !myActive ? (
        <>
          <Divider className="my-1" />
          <Button
            size="sm"
            icon={started ? 'clock-alert-outline' : 'hand-back-right-outline'}
            disabled={started}
            loading={busy}
            onPress={() => onClaim(o)}
          >
            {started ? 'Ca đã bắt đầu — không thể nhận' : 'Nhận ca hỗ trợ'}
          </Button>
        </>
      ) : null}
      {mine?.status === 'Pending' ? (
        <>
          <Divider className="my-1" />
          <Button size="sm" variant="outline" loading={busy} onPress={() => onWithdraw(mine)}>Rút đơn</Button>
        </>
      ) : null}
    </Card>
  );
}

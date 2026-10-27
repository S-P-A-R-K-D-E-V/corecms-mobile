import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Badge, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { getMyPerformance, requestPerformanceReview } from 'src/api/hr';
import { PERFORMANCE_RATING_LABEL, type IPerformanceScore, type PerformanceRating } from 'src/types/hr';
import { canRequestReview, fVnd } from './hr-rules';

// ----------------------------------------------------------------------
// Điểm hiệu suất + xếp loại tháng đã công bố (Quy chế Chương V, VI), kèm số liệu từng ca. Xếp loại theo tỷ lệ đạt target
// chuẩn hoá (bình quân theo giờ các ca đã làm). Có 3 ngày làm việc từ khi công bố để đề nghị xem xét lại (Điều 20).
// ----------------------------------------------------------------------

/** Tháng chạy thử: để làm quen, chưa dùng làm căn cứ đánh giá. */
const TRIAL_MONTHS = ['2026-11-01', '2026-12-01'];

const RATING_TONE: Record<PerformanceRating, 'neutral' | 'error' | 'info' | 'success' | 'primary'> = {
  NotRated: 'neutral',
  NotComplete: 'error',
  Complete: 'info',
  Good: 'success',
  Excellent: 'primary',
};

const COMPONENTS: { key: keyof IPerformanceScore; label: string; max: string }[] = [
  { key: 'salesPoints', label: 'Doanh số', max: '40' },
  { key: 'qualityPoints', label: 'Chất lượng bán', max: '15' },
  { key: 'taskPoints', label: 'Nhiệm vụ', max: '20' },
  { key: 'disciplinePoints', label: 'Kỷ luật', max: '15' },
  { key: 'reconciliationPoints', label: 'Đối soát', max: '10' },
  { key: 'initiativePoints', label: 'Sáng kiến', max: '+5' },
];

const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1 }));

function ScoreCard({ score: s, onReview }: { score: IPerformanceScore; onReview: () => void }) {
  const [showShifts, setShowShifts] = useState(false);
  const shifts = s.details?.shifts ?? [];
  return (
    <SectionCard
      title={`Tháng ${dayjs(s.month).format('MM/YYYY')}`}
      right={<Badge tone={RATING_TONE[s.rating]}>{PERFORMANCE_RATING_LABEL[s.rating]}</Badge>}
      bodyClassName="pt-0 gap-2"
    >
      {TRIAL_MONTHS.includes(s.month) ? (
        <Text variant="caption" tone="warning" className="font-semibold">Tháng chạy thử — chưa dùng làm căn cứ đánh giá.</Text>
      ) : null}
      <View className="flex-row items-end gap-2">
        <Text variant="title">{num(s.total)}</Text>
        <Text variant="caption" tone="muted" className="mb-1">
          điểm{s.isDefaultScore ? ' (mặc định nhân viên mới)' : ''}
        </Text>
      </View>
      {s.ratingReason ? <Text variant="bodySmall">{s.ratingReason}</Text> : null}
      <View className="flex-row flex-wrap gap-1.5">
        {COMPONENTS.map((c) => (
          <Badge key={c.key} tone="neutral">{`${c.label} ${num(s[c.key] as number)}/${c.max}`}</Badge>
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {s.shiftCount} ca · {num(s.hoursWorked)} giờ · đạt target {s.targetAchievementPct == null ? '—' : `${num(s.targetAchievementPct)}%`} · đi
        muộn {s.lateCount} · quên chấm ra {s.missedCheckoutCount} · lỗi bảng kiểm {s.inspectionFaults}
      </Text>
      {(s.details?.notes ?? []).map((n) => (
        <Text key={n} variant="caption" tone="muted">• {n}</Text>
      ))}
      {shifts.length > 0 ? (
        <Button size="sm" variant="ghost" icon={showShifts ? 'chevron-up' : 'chevron-down'} onPress={() => setShowShifts((v) => !v)}>
          {showShifts ? 'Ẩn số liệu từng ca' : `Xem số liệu ${shifts.length} ca`}
        </Button>
      ) : null}
      {showShifts
        ? shifts.map((x, i) => (
            <View key={`${x.date}-${i}`} className="flex-row justify-between py-0.5">
              <Text variant="caption">{dayjs(x.date).format('dd DD/MM')} · {x.shift}</Text>
              <Text variant="caption" tone="muted">
                {x.excluded ? `Loại: ${x.excluded}` : x.target ? `${fVnd(x.revenue)} / ${fVnd(x.target)} · ${num(x.pct)}%` : 'Chưa có target'}
              </Text>
            </View>
          ))
        : null}
      {s.reviewRequestedAt ? (
        <Text variant="caption" tone="muted">Bạn đã đề nghị xem xét lại: {s.reviewRequestNote}</Text>
      ) : null}
      {s.reviewResponse ? <Text variant="caption" tone="primary">Trả lời: {s.reviewResponse}</Text> : null}
      {canRequestReview(s.reviewDeadline, s.reviewRequestedAt) ? (
        <Button size="sm" variant="outline" icon="message-alert-outline" onPress={onReview}>
          Đề nghị xem xét lại (hạn {dayjs(s.reviewDeadline).subtract(1, 'minute').format('DD/MM')})
        </Button>
      ) : null}
    </SectionCard>
  );
}

export function HrPerformanceScreen() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['hr', 'performance'], queryFn: getMyPerformance });
  const [reviewing, setReviewing] = useState<IPerformanceScore | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const list = query.data ?? [];

  async function send() {
    if (!reviewing) return;
    setBusy(true);
    try {
      await requestPerformanceReview(reviewing.id, note.trim());
      toast.success('Đã gửi đề nghị xem xét lại.');
      setReviewing(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['hr', 'performance'] });
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa gửi được');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll refreshing={query.isFetching} onRefresh={query.refetch}>
      <AppHeader title="Điểm & xếp loại" back />
      <Text variant="caption" tone="muted">
        Điểm dùng để xếp lịch tham khảo, không quyết định thứ tự đăng ký ca. Xếp loại tính theo tỷ lệ đạt target của các ca bạn
        làm, nên ca vắng không bị so sánh bất lợi với ca đông.
      </Text>

      {query.isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được kết quả: {extractApiError(query.error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
        </View>
      ) : !query.isLoading && list.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted">Chưa có kết quả nào được công bố.</Text>
        </View>
      ) : (
        list.map((s) => <ScoreCard key={s.id} score={s} onReview={() => setReviewing(s)} />)
      )}

      <Sheet
        visible={!!reviewing}
        title="Đề nghị xem xét lại"
        onClose={busy ? () => {} : () => setReviewing(null)}
        footer={
          <Button loading={busy} disabled={busy || !note.trim()} onPress={send}>
            Gửi
          </Button>
        }
      >
        <TextField
          label="Điểm nào cần xem lại, vì sao"
          placeholder="Vd: ca 05/11 mất điện 2 giờ"
          value={note}
          onChangeText={setNote}
          multiline
        />
      </Sheet>
    </Screen>
  );
}

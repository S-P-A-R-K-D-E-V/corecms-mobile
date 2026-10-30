import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Badge, TextField, SegmentedControl } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import {
  getMyBonusPrograms,
  getMyPerformance,
  getMyViolations,
  getMyWeeklyBonus,
  getPerformanceMonth,
  requestPerformanceReview,
} from 'src/api/hr';
import { getMyCurrentEstimate } from 'src/api/home';
import { useAuthContext } from 'src/auth/auth-context';
import { PERMISSIONS, hasPermission } from 'src/auth/permissions';
import { PERFORMANCE_RATING_LABEL, type IPerformanceScore } from 'src/types/hr';
import { bonusText, canRequestReview, fVnd, monthOf, rankScores } from './hr-rules';
import { MyScoreCard, RATING_TONE, num } from './HrScoreCards';
import { useActiveHrRules } from './hooks';

// ----------------------------------------------------------------------
// Điểm, lương & thưởng (A3): lương tạm tính kỳ này, thưởng doanh số tuần của tôi, điểm các tháng; quản lý (hr.performance.read)
// xem điểm từng người. Thưởng tuần / điểm chỉ hiện khi cửa hàng bật (Cấu hình luật). Điểm hiệu suất + xếp loại tháng đã công
// bố, kèm số liệu từng ca; đề nghị xem xét lại trong hạn backend trả về.
// ----------------------------------------------------------------------

/** Tháng chạy thử: để làm quen, chưa dùng làm căn cứ đánh giá. */
const TRIAL_MONTHS = ['2026-11-01', '2026-12-01'];

// Điểm nhiệm vụ và sáng kiến đã bỏ (chủ tịch 2026-10-28); phần của chúng chia lại cho các thành phần còn lại.
const COMPONENTS: { key: keyof IPerformanceScore; label: string }[] = [
  { key: 'salesPoints', label: 'Doanh số' },
  { key: 'qualityPoints', label: 'Chất lượng bán' },
  { key: 'disciplinePoints', label: 'Kỷ luật' },
  { key: 'reconciliationPoints', label: 'Đối soát' },
];

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
          <Badge key={c.key} tone="neutral">{`${c.label} ${num(s[c.key] as number)}`}</Badge>
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

// ── Dashboard (A3): lương tạm tính, thưởng tuần, điểm các tháng; quản lý xem từng người ──────────────────────────────

/** Điểm trừ tháng này theo danh mục vi phạm — chỉ hiện khi cửa hàng có danh mục (backend cũ: ẩn). */
function DeductionsCard() {
  const month = monthOf();
  const query = useQuery({ queryKey: ['hr', 'violations', 'mine', month], queryFn: () => getMyViolations(month), retry: false });
  if (!query.data?.policy) return null;
  const s = query.data.summary;
  const bonus = bonusText(s) && !query.data.policy.appliesToBonus ? `${bonusText(s)} (chưa tính vào thưởng)` : bonusText(s);
  return (
    <SectionCard title="Điểm trừ tháng này" bodyClassName="pt-0 gap-1">
      <View className="flex-row items-end gap-2">
        <Text variant="title" tone={s.points > 0 ? 'error' : 'success'}>{s.points}</Text>
        <Text variant="caption" tone="muted" className="mb-1">điểm · {s.count} lần</Text>
      </View>
      {bonus ? <Text variant="bodySmall">{bonus}</Text> : null}
      <Button size="sm" variant="ghost" icon="chevron-right" onPress={() => router.push('/hr/violations' as any)}>
        Xem từng lần, khiếu nại
      </Button>
    </SectionCard>
  );
}

function EarningsCard() {
  const q = useQuery({ queryKey: ['payroll', 'current-estimate'], queryFn: getMyCurrentEstimate });
  const e = q.data;
  return (
    <SectionCard title="Lương tạm tính kỳ này" bodyClassName="pt-0 gap-1">
      {q.isLoading ? (
        <Text variant="caption" tone="muted">Đang tải…</Text>
      ) : q.isError || !e ? (
        <Text variant="caption" tone="muted">Chưa xem được lương tạm tính.</Text>
      ) : !e.configured ? (
        <Text variant="caption" tone="muted">Chưa có cấu hình lương — hỏi chủ hộ.</Text>
      ) : (
        <>
          <Text variant="title">{fVnd(e.estimatedSalary)}</Text>
          <Text variant="caption" tone="muted">
            {e.cycleName ?? 'Kỳ hiện tại'} · {dayjs(e.fromDate).format('DD/MM')}–{dayjs(e.toDate).format('DD/MM')} · tính tới{' '}
            {dayjs(e.asOf).format('DD/MM HH:mm')}
          </Text>
          <View className="flex-row flex-wrap gap-1.5 mt-1">
            <Badge tone="neutral">{`Lương giờ ${fVnd(e.baseSalary)}`}</Badge>
            {e.overtimeSalary > 0 ? <Badge tone="neutral">{`Phụ cấp ${fVnd(e.overtimeSalary)}`}</Badge> : null}
            {e.bonus > 0 ? <Badge tone="success">{`Thưởng ${fVnd(e.bonus)}`}</Badge> : null}
            {e.deduction > 0 ? <Badge tone="warning">{`Khấu trừ ${fVnd(e.deduction)}`}</Badge> : null}
          </View>
          <Text variant="caption" tone="muted">
            {e.workedShifts}/{e.assignedShifts} ca · {num(e.hoursWorked)} giờ
          </Text>
        </>
      )}
    </SectionCard>
  );
}

function WeeklyBonusCard() {
  const to = dayjs().format('YYYY-MM-DD');
  const from = dayjs().subtract(7, 'week').format('YYYY-MM-DD');
  const q = useQuery({ queryKey: ['hr', 'weekly-bonus', from], queryFn: () => getMyWeeklyBonus(from, to) });
  const weeks = q.data ?? [];
  return (
    <SectionCard title="Thưởng doanh số tuần" bodyClassName="pt-0 gap-1.5">
      {q.isLoading ? (
        <Text variant="caption" tone="muted">Đang tải…</Text>
      ) : weeks.length === 0 ? (
        <Text variant="caption" tone="muted">Chưa có tuần nào có target.</Text>
      ) : (
        weeks.map((w) => (
          <View key={w.weekStart} className="flex-row items-center justify-between gap-2">
            <View className="flex-1">
              <Text variant="bodySmall">
                Tuần {dayjs(w.weekStart).format('DD/MM')} · đạt {num(w.achievementPct)}%
              </Text>
              <Text variant="caption" tone="muted">
                Quỹ {fVnd(w.fund)} · bạn {num(w.myHours)}/{num(w.totalHours)} giờ
              </Text>
              {w.appliedPct != null && w.appliedPct < 100 ? (
                <Text variant="caption" tone="warning">
                  Nhận {w.appliedPct}% do điểm trừ ({w.deductionPoints ?? 0} điểm) · chia theo giờ {fVnd(w.baseAmount ?? 0)}
                </Text>
              ) : w.baseAmount != null && w.myAmount > w.baseAmount ? (
                <Text variant="caption" tone="muted">Gồm phần chia lại {fVnd(w.myAmount - w.baseAmount)}</Text>
              ) : null}
            </View>
            <View className="items-end">
              <Text variant="bodySmall" className="font-semibold">{fVnd(w.myAmount)}</Text>
              <Badge tone={w.paidInPayroll ? 'success' : 'neutral'}>{w.paidInPayroll ? 'Vào lương' : 'Tính thử'}</Badge>
            </View>
          </View>
        ))
      )}
    </SectionCard>
  );
}

/** Thưởng theo đơn (hoa hồng đơn online…) của tháng này và tháng trước — ẩn khi cửa hàng chưa có chương trình nào. */
function BonusProgramsCard() {
  const months = [dayjs().startOf('month'), dayjs().subtract(1, 'month').startOf('month')].map((m) => m.format('YYYY-MM-DD'));
  // Backend cũ chưa có /bonus-programs → coi như không có chương trình.
  const q = useQuery({
    queryKey: ['hr', 'bonus-programs', months[0]],
    queryFn: async () => (await Promise.all(months.map((m) => getMyBonusPrograms(m).catch(() => [])))).flat(),
  });
  const rows = q.data ?? [];
  if (rows.length === 0) return null;
  return (
    <SectionCard title="Thưởng theo đơn" bodyClassName="pt-0 gap-1.5">
      <Text variant="caption" tone="muted">
        Đơn được tính khi hết hạn đổi trả, trả vào lương kỳ cuối tháng. Đơn không có người chốt chia cho người đang làm ca lúc bán.
      </Text>
      {rows.map((r) => (
        <View key={`${r.programId}-${r.month}`} className="flex-row items-center justify-between gap-2">
          <View className="flex-1">
            <Text variant="bodySmall">{r.name}</Text>
            <Text variant="caption" tone="muted">
              Tháng {dayjs(r.month).format('MM/YYYY')} · {r.orders} đơn
            </Text>
          </View>
          <View className="items-end">
            <Text variant="bodySmall" className="font-semibold">{fVnd(r.amount)}</Text>
            <Badge tone={r.paidAmount > 0 ? 'success' : 'neutral'}>
              {r.paidAmount >= r.amount ? 'Vào lương' : r.paidAmount > 0 ? `Vào lương ${fVnd(r.paidAmount)}` : 'Tính thử'}
            </Badge>
          </View>
        </View>
      ))}
    </SectionCard>
  );
}

/** Điểm 6 tháng gần nhất dạng thanh ngang (thang 0–100). */
function ScoreTrend({ scores }: { scores: IPerformanceScore[] }) {
  const recent = [...scores].sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  if (recent.length < 2) return null;
  return (
    <SectionCard title="Điểm các tháng" bodyClassName="pt-0 gap-1.5">
      {recent.map((s) => (
        <View key={s.id} className="flex-row items-center gap-2">
          <Text variant="caption" className="w-14">{dayjs(s.month).format('MM/YYYY')}</Text>
          <View className="flex-1 h-2.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <View className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.min(100, s.total))}%` }} />
          </View>
          <Text variant="caption" className="w-10 text-right">{num(s.total)}</Text>
        </View>
      ))}
    </SectionCard>
  );
}

function TeamPerformance({ initialMonth }: { initialMonth?: string }) {
  const [month, setMonth] = useState(() => (initialMonth ? dayjs(initialMonth) : dayjs()).startOf('month'));
  const key = month.format('YYYY-MM-01');
  const q = useQuery({ queryKey: ['hr', 'performance-month', key], queryFn: () => getPerformanceMonth(key) });
  const scores = rankScores(q.data?.scores ?? []);
  return (
    <>
      <View className="flex-row items-center justify-between">
        <Button size="sm" variant="ghost" fullWidth={false} icon="chevron-left" onPress={() => setMonth((m) => m.subtract(1, 'month'))}>
          Trước
        </Button>
        <Text variant="subtitle">Tháng {month.format('MM/YYYY')}</Text>
        <Button
          size="sm"
          variant="ghost"
          fullWidth={false}
          icon="chevron-right"
          disabled={!month.isBefore(dayjs().startOf('month'))}
          onPress={() => setMonth((m) => m.add(1, 'month'))}
        >
          Sau
        </Button>
      </View>
      <Text variant="caption" tone="muted">
        {q.data?.publishedAt
          ? `Đã công bố ${dayjs(q.data.publishedAt).format('DD/MM')}`
          : q.data?.computedAt
            ? month.isSame(dayjs(), 'month')
              ? `Tạm tính tới hôm qua, cập nhật ${dayjs(q.data.computedAt).format('HH:mm DD/MM')}`
              : 'Đã tính, chưa công bố'
            : 'Chưa tính điểm tháng này'}
      </Text>
      {q.isError ? (
        <Text variant="bodySmall" tone="error">Không tải được: {extractApiError(q.error)}</Text>
      ) : (
        scores.map(({ score: s, rank }) => (
          <SectionCard
            key={s.id}
            title={rank ? `${rank}. ${s.fullName}` : s.fullName}
            right={<Badge tone={RATING_TONE[s.rating]}>{PERFORMANCE_RATING_LABEL[s.rating]}</Badge>}
            bodyClassName="pt-0 gap-1"
          >
            <Text variant="bodySmall" className="font-semibold">{num(s.total)} điểm</Text>
            <Text variant="caption" tone="muted">
              {s.shiftCount} ca · {num(s.hoursWorked)} giờ · đạt target{' '}
              {s.targetAchievementPct == null ? '—' : `${num(s.targetAchievementPct)}%`} · đi muộn {s.lateCount}
            </Text>
          </SectionCard>
        ))
      )}
    </>
  );
}

export function HrPerformanceScreen() {
  const qc = useQueryClient();
  const rules = useActiveHrRules();
  // Backend cũ (chưa có luật theo cửa hàng) → hiện như trước.
  const weeklyBonusOn = rules?.weeklyBonusEnabled ?? true;
  const performanceOn = rules?.performanceEnabled ?? true;
  const { user } = useAuthContext();
  const canSeeTeam = hasPermission(user, PERMISSIONS.hr.performanceRead);
  const params = useLocalSearchParams<{ tab?: string; month?: string }>();
  const [tab, setTab] = useState<'mine' | 'team'>(params.tab === 'team' ? 'team' : 'mine');
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
    <Screen
      scroll
      refreshing={query.isFetching}
      onRefresh={() => {
        query.refetch();
        qc.invalidateQueries({ queryKey: ['payroll', 'current-estimate'] });
        qc.invalidateQueries({ queryKey: ['hr', 'weekly-bonus'] });
        qc.invalidateQueries({ queryKey: ['hr', 'performance-month'] });
      }}
    >
      <AppHeader title="Điểm, lương & thưởng" back />
      {canSeeTeam ? (
        <SegmentedControl
          value={tab}
          onChange={(k) => setTab(k as 'mine' | 'team')}
          segments={[
            { key: 'mine', label: 'Của tôi' },
            { key: 'team', label: 'Từng người' },
          ]}
        />
      ) : null}

      {tab === 'team' && canSeeTeam ? (
        <TeamPerformance initialMonth={params.month} />
      ) : (
        <>
          <MyScoreCard />
          <DeductionsCard />
          <EarningsCard />
          {weeklyBonusOn ? <WeeklyBonusCard /> : null}
          <BonusProgramsCard />
          {performanceOn ? <ScoreTrend scores={list} /> : null}
        </>
      )}

      {(tab === 'team' && canSeeTeam) || !performanceOn ? null : query.isError ? (
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

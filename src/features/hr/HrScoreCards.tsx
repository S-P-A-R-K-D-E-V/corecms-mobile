import { PixelRatio, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { SectionCard } from 'src/components/shared';
import { Text, Badge, Divider, Pressable, ProgressRing } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { SHIFT_SCHEDULING_FEATURE } from 'src/features/launcher/registry';
import { getMyPerformance, getMyProvisionalPerformance, getMyViolations, getPerformanceMonth } from 'src/api/hr';
import { PERFORMANCE_RATING_LABEL, type PerformanceRating } from 'src/types/hr';
import { monthOf, rankScores } from './hr-rules';
import { useActiveHrRules } from './hooks';

// ----------------------------------------------------------------------
// Thẻ điểm ở trang chủ: điểm tạm tính của tôi và xếp hạng cả cửa hàng (hr.performance.read). Tháng đang chạy là tạm tính:
// hệ thống tính lại mỗi ngày, số liệu tới hôm qua, nhân viên chỉ thấy điểm của mình.
// ----------------------------------------------------------------------

export const RATING_TONE: Record<PerformanceRating, 'neutral' | 'error' | 'info' | 'success' | 'primary'> = {
  NotRated: 'neutral',
  NotComplete: 'error',
  Complete: 'info',
  Good: 'success',
  Excellent: 'primary',
};

const TOP = 5;

export const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1 }));

/** Cửa hàng có phân ca và bật chấm điểm. Chưa tải được luật thì coi như tắt, trang chủ không hiện thẻ. */
function useScoresOn() {
  const { user } = useAuthContext();
  const rules = useActiveHrRules();
  return !!user?.enabledFeatures?.includes(SHIFT_SCHEDULING_FEATURE) && !!rules?.performanceEnabled;
}

/**
 * Vòng điểm tạm tính cạnh lương dự kiến trên trang chủ nhân viên. Đầy ở 100 điểm (điểm có thể vượt 100, số ở giữa vẫn là điểm
 * thật). Chưa có điểm thì không hiện. Luôn hiện, không theo nút mắt của lương (chủ tịch 2026-10-30).
 */
export function HeroScoreRing() {
  const on = useScoresOn();
  const { width } = useWindowDimensions();
  const compact = width < 360 || PixelRatio.getFontScale() > 1.3;
  const size = compact ? 60 : 72;
  const query = useQuery({ queryKey: ['hr', 'performance-provisional'], queryFn: getMyProvisionalPerformance, enabled: on, retry: false });
  const score = query.data?.score;
  if (!on || !score || score.shiftCount === 0) return null;

  return (
    <Pressable
      onPress={() => router.push('/hr/performance' as any)}
      accessibilityLabel={`Điểm tạm tính ${num(score.total)}, xem chi tiết`}
      className="items-center gap-1"
    >
      <ProgressRing size={size} stroke={compact ? 6 : 7} progress={score.total / 100} color="#FFFFFF" trackColor="rgba(255,255,255,0.22)">
        <Text
          tone="inverse"
          className="font-bold"
          style={{ fontSize: compact ? 15 : 18, fontVariant: ['tabular-nums'], maxWidth: size - 16 }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {num(score.total)}
        </Text>
      </ProgressRing>
      <Text variant="caption" style={{ color: 'rgba(255,255,255,0.72)' }} numberOfLines={1}>Điểm tạm tính</Text>
    </Pressable>
  );
}

/** @param linkToDetail true ở trang chủ: bấm vào mở màn Điểm, lương & thưởng; số điểm đã có ở vòng điểm nên không lặp lại. */
export function MyScoreCard({ linkToDetail = false }: { linkToDetail?: boolean }) {
  const on = useScoresOn();
  const month = monthOf();
  const current = useQuery({ queryKey: ['hr', 'performance-provisional'], queryFn: getMyProvisionalPerformance, enabled: on, retry: false });
  const published = useQuery({ queryKey: ['hr', 'performance'], queryFn: getMyPerformance, enabled: on && linkToDetail, retry: false });
  const violations = useQuery({
    queryKey: ['hr', 'violations', 'mine', month],
    queryFn: () => getMyViolations(month),
    enabled: on && linkToDetail,
    retry: false,
  });
  if (!on || !current.data) return null;

  const { computedAt } = current.data;
  const score = current.data.score && current.data.score.shiftCount > 0 ? current.data.score : null;
  const lastPublished = linkToDetail ? published.data?.[0] : undefined;
  if (!score && !lastPublished) return null;
  const deductions = linkToDetail && violations.data?.policy ? violations.data.summary.points : null;

  const body = (
    <SectionCard
      title={`Điểm của tôi · tháng ${dayjs(current.data.month).format('MM/YYYY')}`}
      icon="star-outline"
      right={score ? <Badge tone={RATING_TONE[score.rating]}>{PERFORMANCE_RATING_LABEL[score.rating]}</Badge> : undefined}
      bodyClassName="pt-0 gap-1"
    >
      {score ? (
        <>
          {linkToDetail ? null : (
            <View className="flex-row items-end gap-2">
              <Text variant="title">{num(score.total)}</Text>
              <Text variant="caption" tone="muted" className="mb-1">
                điểm tạm tính{score.isDefaultScore ? ' (mặc định)' : ''}
              </Text>
            </View>
          )}
          <Text variant="bodySmall">
            {score.shiftCount} ca · đạt target {score.targetAchievementPct == null ? '—' : `${num(score.targetAchievementPct)}%`}
            {linkToDetail && score.isDefaultScore ? ' · điểm mặc định' : ''}
          </Text>
        </>
      ) : (
        <Text variant="bodySmall" tone="muted">Chưa có điểm tạm tính tháng này.</Text>
      )}
      {deductions !== null ? <Text variant="bodySmall">Điểm trừ tháng này: {deductions}</Text> : null}
      {score && computedAt ? (
        <Text variant="caption" tone="muted">
          Số liệu tới hôm qua, cập nhật {dayjs(computedAt).format('HH:mm DD/MM')}. Điểm chính thức có sau khi cửa hàng công bố.
        </Text>
      ) : null}
      {lastPublished ? (
        <Text variant="caption" tone="muted">
          Tháng {dayjs(lastPublished.month).format('MM/YYYY')} đã công bố: {num(lastPublished.total)} điểm ·{' '}
          {PERFORMANCE_RATING_LABEL[lastPublished.rating]}
        </Text>
      ) : null}
    </SectionCard>
  );
  return linkToDetail ? <Pressable onPress={() => router.push('/hr/performance' as any)}>{body}</Pressable> : body;
}

/** Top {TOP} theo điểm tháng này; ngày đầu tháng chưa có số thì lấy tháng trước. */
export function StaffRankingCard() {
  const on = useScoresOn();
  const query = useQuery({
    queryKey: ['hr', 'performance-month', 'home-ranking'],
    enabled: on,
    retry: false,
    queryFn: async () => {
      const current = await getPerformanceMonth(monthOf());
      return current.scores.length > 0 ? current : getPerformanceMonth(monthOf(dayjs().subtract(1, 'month')));
    },
  });
  if (!on || !query.data || query.data.scores.length === 0) return null;

  const { month, publishedAt } = query.data;
  const rows = rankScores(query.data.scores).slice(0, TOP);
  const provisional = !publishedAt && month.slice(0, 7) === dayjs().format('YYYY-MM');

  return (
    <SectionCard
      title="Xếp hạng nhân sự"
      icon="trophy-outline"
      right={<Text variant="caption" tone="muted">Tháng {dayjs(month).format('MM/YYYY')}{provisional ? ' · tạm tính' : ''}</Text>}
      bodyClassName="pt-0"
    >
      {rows.map(({ score: s, rank }, i) => (
        <View key={s.id}>
          {i > 0 ? <Divider /> : null}
          <View className="flex-row items-center gap-3 py-2">
            <Text variant="bodySmall" className="w-6 font-semibold">{rank ?? '—'}</Text>
            <View className="flex-1">
              <Text variant="bodySmall" className="font-semibold" numberOfLines={1}>{s.fullName}</Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>{PERFORMANCE_RATING_LABEL[s.rating]}</Text>
            </View>
            <Text variant="bodySmall" className="font-semibold">{s.shiftCount > 0 ? `${num(s.total)} điểm` : '—'}</Text>
          </View>
        </View>
      ))}
      <Pressable
        onPress={() => router.push({ pathname: '/hr/performance', params: { tab: 'team', month: month.slice(0, 10) } } as any)}
        className="pt-2 items-center"
      >
        <Text variant="caption" tone="primary" className="font-semibold">Xem cả cửa hàng</Text>
      </Pressable>
    </SectionCard>
  );
}

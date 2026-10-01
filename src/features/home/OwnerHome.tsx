import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, SectionCard } from 'src/components/shared';
import { Text, Icon, Pressable, Badge, Divider, Skeleton } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { getLocale, t } from 'src/i18n';
import type { IRecentOrder, ITopSellingProduct } from 'src/types/corecms-api';

import { FeatureGrid } from 'src/features/launcher/FeatureGrid';
import { RevenueChart } from 'src/features/admin-dashboard/RevenueChart';
import { useDashboardSummary, useRevenueReport, fmtMoney, fmtCompact } from 'src/features/admin-dashboard/hooks';

import { HomeHero, HeroLabel, HeroAmount, HeroStats, HeroChip, EyeToggle, HERO_OVERLAP } from './HomeHero';
import { TeamTodayCard } from './TeamTodayCard';
import { useAmountVisibility, useBreakEvenToday, useMonthProfit, percentChange, timeAgo, HIDDEN_AMOUNT } from './hooks';

// ----------------------------------------------------------------------
// Trang chủ chủ cửa hàng: thẻ "số dư" = doanh thu tháng (so cùng kỳ tháng trước), lợi nhuận gộp ẩn mặc
// định; Dùng nhanh (8 ghim); tiến độ hoà vốn ngày; nhân sự hôm nay; bán gần đây; doanh thu 7 ngày.
// ----------------------------------------------------------------------

function monthName() {
  return getLocale() === 'vi' ? dayjs().format('M') : dayjs().format('MMMM');
}

function OwnerBalance() {
  const { data, isLoading } = useDashboardSummary();
  const profitQ = useMonthProfit();
  const showProfit = useAmountVisibility((s) => s.profit);
  const toggle = useAmountVisibility((s) => s.toggle);

  const change = data ? percentChange(data.monthRevenue, data.lastMonthSamePeriodRevenue) : null;

  return (
    <View>
      <HeroLabel>{t('home.monthRevenue', { month: monthName() })}</HeroLabel>
      {isLoading ? (
        <View style={{ height: 36, width: 200, borderRadius: 10, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.18)' }} />
      ) : (
        <HeroAmount value={fmtMoney(data?.monthRevenue)} />
      )}
      {change !== null ? (
        <HeroChip icon={change >= 0 ? 'trending-up' : 'trending-down'}>
          {`${change >= 0 ? '+' : ''}${change}% ${t('home.vsLastMonth')}`}
        </HeroChip>
      ) : data ? (
        <HeroChip icon="receipt">{t('home.orders', { n: data.monthOrders })}</HeroChip>
      ) : null}
      <HeroStats
        items={[
          {
            label: t('home.today'),
            value: data ? `${fmtCompact(data.todayRevenue)} · ${t('home.orders', { n: data.todayOrders })}` : '—',
          },
          {
            label: t('home.grossProfit'),
            value: !showProfit ? HIDDEN_AMOUNT : profitQ.data ? fmtMoney(profitQ.data.grossProfit) : '—',
            right: <EyeToggle small hidden={!showProfit} onToggle={() => toggle('profit')} />,
          },
        ]}
      />
    </View>
  );
}

function LowStockBanner() {
  const { data } = useDashboardSummary();
  if (!data || data.lowStockCount <= 0) return null;
  return (
    <Pressable
      onPress={() => router.push('/(tabs)/products' as any)}
      className="flex-row items-center gap-3 px-4 py-3 rounded-2xl bg-warning-soft"
    >
      <Icon name="package-variant-closed-remove" size={22} tone="warning" />
      <View className="flex-1">
        <Text variant="bodySmall" tone="warning" className="font-bold">{t('home.lowStock', { n: data.lowStockCount })}</Text>
        <Text variant="caption" tone="warning">{t('home.lowStockHint')}</Text>
      </View>
      <Icon name="chevron-right" size={18} tone="warning" />
    </Pressable>
  );
}

function BreakEvenCard() {
  const { data, isLoading, isError } = useBreakEvenToday();
  if (isError) return null;

  const target = data?.breakEvenRevenue ?? 0;
  const actual = data?.actualRevenue ?? 0;
  const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
  const reached = target > 0 && actual >= target;

  return (
    <Pressable onPress={() => router.push('/admin/break-even' as any)}>
      <SectionCard
        title={t('home.breakEvenToday')}
        icon="target"
        right={target > 0 ? <Text variant="caption" tone="muted">{t('home.breakEvenTarget', { amount: fmtCompact(target) })}</Text> : null}
        bodyClassName="pt-0"
      >
        {isLoading ? (
          <Skeleton width="100%" height={52} radius={12} />
        ) : target <= 0 ? (
          <Text variant="bodySmall" tone="muted">{t('home.breakEvenNotSet')}</Text>
        ) : (
          <View className="gap-2">
            <View className="flex-row items-end justify-between">
              <Text className="text-[26px] leading-[30px] font-bold" tone={reached ? 'success' : 'primary'}>
                {pct}%
              </Text>
              <Text variant="bodySmall" tone={reached ? 'success' : 'muted'} className="font-semibold mb-0.5">
                {reached
                  ? t('home.breakEvenReached', { amount: fmtCompact(actual - target) })
                  : t('home.breakEvenRemaining', { amount: fmtCompact(target - actual) })}
              </Text>
            </View>
            <View className="h-2.5 rounded-full bg-ink/5 dark:bg-white/10 overflow-hidden">
              <View
                className={cn('h-full rounded-full', reached ? 'bg-success' : 'bg-primary')}
                style={{ width: `${Math.min(100, Math.max(3, pct))}%` }}
              />
            </View>
            <Text variant="caption" tone="muted">
              {t('admin.revenueToday')}: {fmtMoney(actual)}
            </Text>
          </View>
        )}
      </SectionCard>
    </Pressable>
  );
}

function SaleRow({ order }: { order: IRecentOrder }) {
  const cancelled = /cancel|huỷ|hủy/i.test(order.status);
  const detail = order.itemsSummary ?? (order.itemCount ? t('home.items', { n: order.itemCount }) : null);
  const meta = [order.soldByName ? t('home.soldBy', { name: order.soldByName }) : null, timeAgo(order.createdAt)]
    .filter(Boolean)
    .join(' · ');
  return (
    <View className={cn('flex-row items-center gap-3 py-2.5', cancelled && 'opacity-50')}>
      <View className="w-10 h-10 rounded-xl bg-success-soft items-center justify-center">
        <Icon name="receipt" size={20} tone="success" />
      </View>
      <View className="flex-1">
        <Text variant="bodySmall" className="font-semibold" numberOfLines={1}>
          {detail ?? order.orderNumber}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {detail ? `${order.orderNumber} · ` : ''}{meta}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text variant="bodySmall" className="font-bold" style={{ fontVariant: ['tabular-nums'] }}>
          {fmtMoney(order.totalAmount)}
        </Text>
        {cancelled ? <Badge tone="error">{order.status}</Badge> : null}
      </View>
    </View>
  );
}

function RecentSalesCard() {
  const { data, isLoading } = useDashboardSummary();
  const orders = (data?.recentOrders ?? []).slice(0, 5);
  return (
    <SectionCard
      title={t('home.recentSales')}
      icon="cart-outline"
      right={
        <Pressable onPress={() => router.push('/(tabs)/invoices' as any)} hitSlop={8} className="flex-row items-center">
          <Text variant="caption" tone="muted" className="font-semibold">{t('home.seeAll')}</Text>
          <Icon name="chevron-right" size={16} tone="muted" />
        </Pressable>
      }
      bodyClassName="pt-0"
    >
      {isLoading ? (
        <Skeleton width="100%" height={140} radius={12} />
      ) : orders.length === 0 ? (
        <Text variant="bodySmall" tone="muted" className="py-2">{t('home.recentSalesEmpty')}</Text>
      ) : (
        orders.map((o, i) => (
          <View key={o.id}>
            {i > 0 ? <Divider className="ml-[52px]" /> : null}
            <SaleRow order={o} />
          </View>
        ))
      )}
    </SectionCard>
  );
}

function RevenueWeekCard() {
  const { data, isLoading } = useRevenueReport(7);
  if (!isLoading && (!data || data.periods.length === 0)) return null;
  return (
    <SectionCard
      title={t('home.revenue7Days')}
      icon="chart-line"
      right={data ? <Text variant="caption" tone="muted">{fmtMoney(data.totalRevenue)}</Text> : null}
      bodyClassName="pt-0"
    >
      {isLoading || !data ? <Skeleton width="100%" height={150} radius={12} /> : <RevenueChart periods={data.periods} />}
    </SectionCard>
  );
}

function TopProductsCard() {
  const { data } = useDashboardSummary();
  const items = (data?.topSellingProducts ?? []).slice(0, 5);
  if (items.length === 0) return null;
  return (
    <SectionCard title={t('home.topProducts')} icon="trophy-outline" bodyClassName="pt-0">
      <View className="gap-2.5">
        {items.map((p: ITopSellingProduct, i: number) => (
          <View key={p.productId} className="flex-row items-center gap-3">
            <View className={cn('w-7 h-7 rounded-full items-center justify-center', i === 0 ? 'bg-warning-soft' : 'bg-ink/5 dark:bg-white/10')}>
              <Text variant="caption" tone={i === 0 ? 'warning' : 'muted'} className="font-bold">{i + 1}</Text>
            </View>
            <Text variant="bodySmall" className="flex-1" numberOfLines={1}>{p.productName}</Text>
            <Text variant="caption" tone="muted">{p.quantitySold} {t('admin.sold')}</Text>
            <Text variant="bodySmall" className="font-semibold w-[64px] text-right">{fmtCompact(p.revenue)}</Text>
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

export function OwnerHome() {
  const qc = useQueryClient();
  const summary = useDashboardSummary();

  const onRefresh = () =>
    qc.invalidateQueries({ predicate: (q) => ['admin', 'home', 'notifications'].includes(q.queryKey[0] as string) });

  return (
    <Screen scroll padded={false} edges={['left', 'right']} refreshing={summary.isRefetching} onRefresh={onRefresh}>
      <HomeHero>
        <OwnerBalance />
      </HomeHero>

      {/* Thẻ Dùng nhanh đè lên mép khối màu như MB Bank (14 = gap của Screen). */}
      <View className="px-4 gap-3.5" style={{ marginTop: -HERO_OVERLAP - 14 }}>
        <FeatureGrid solid variant="admin" title={t('home.quickActions')} onSeeAll={() => router.push('/(tabs)/features' as any)} />
        <LowStockBanner />
        <BreakEvenCard />
        <TeamTodayCard />
        <RecentSalesCard />
        <RevenueWeekCard />
        <TopProductsCard />
      </View>
    </Screen>
  );
}

import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader, EmptyState, type HeaderAction } from 'src/components/shared';
import { Text, Icon, Pressable, Chip, Spinner } from 'src/components/ui';
import { showActionSheet } from 'src/components/overlay';
import { cn } from 'src/components/ui/utils';
import { useAuthContext } from 'src/auth/auth-context';
import { usesAdminShell } from 'src/auth/roles';
import { useResponsive } from 'src/hooks/use-responsive';
import { t } from 'src/i18n';
import type { IFloorTable, IOrderSummary } from 'src/types/fnb';

import { money } from 'src/features/erp/shared';
import { useWorkingBranch } from 'src/features/branch/working-branch';
import { WorkingBranchSheet } from 'src/features/branch/WorkingBranchSheet';
import { isSplitPos } from 'src/features/pos/pos-layout';
import { minutesSince, staleUnprinted, tableStatus, tablesOf } from './floor';
import { GRID_GAP, gridColumns, tileWidth } from './fnb-layout';
import { newId } from './fnb-ids';
import { useFnbFloor, useFnbMenu, useFnbSync, useNow } from './use-fnb';
import { useFnbQueue } from './write-queue';

// ----------------------------------------------------------------------
// Sơ đồ bàn F&B (thay màn Bán hàng khi chi nhánh đang làm việc là F&B và cửa hàng bật commerce.fnb.pos):
// chip khu vực, lưới bàn (trống / có khách / đã tạm tính), đơn mang về, cảnh báo phiếu bar chưa in quá 30 giây
// và lệnh ghi còn chờ / cần xử lý. Bấm bàn trống → đơn mới (id sinh trên máy); bàn có đơn → mở đơn.
// ----------------------------------------------------------------------

const TAB_CLEARANCE = 96;

/** `fresh` = đơn mới sinh trên máy (chưa có trên máy chủ); `shared` = mở thêm đơn ở bàn đang có đơn. */
export type OrderRouteParams = { id: string; tableId?: string; tableName?: string; areaName?: string; fresh?: string; shared?: string };

export function openOrderScreen(params: OrderRouteParams, replace = false) {
  const href = { pathname: '/fnb/order/[id]', params } as any;
  if (replace) router.replace(href);
  else router.push(href);
}

function TableTile({ table, width, now, onPress }: { table: IFloorTable; width: number; now: number; onPress: () => void }) {
  const status = tableStatus(table);
  const total = table.orders.reduce((s, o) => s + o.total, 0);
  const oldest = table.orders.reduce<string | null>((m, o) => (!m || o.openedAt < m ? o.openedAt : m), null);
  const guests = table.orders.reduce((s, o) => s + (o.guestCount ?? 0), 0);
  const pending = table.orders.some((o) => o.pendingLineCount > 0);
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={table.name}
      style={{ width: width || undefined }}
      className={cn(
        'h-[104px] rounded-2xl p-3 justify-between border',
        status === 'free' && 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark',
        status === 'occupied' && 'border-primary bg-primary-soft',
        status === 'billed' && 'border-warning bg-warning-soft',
        !table.isActive && 'opacity-50'
      )}
    >
      <View className="flex-row items-start justify-between gap-1">
        <Text variant="headline" numberOfLines={1} className="flex-1">{table.name}</Text>
        {table.orders.length > 1 ? (
          <View className="px-1.5 rounded-full bg-primary"><Text variant="caption" tone="inverse" className="font-bold">{table.orders.length}</Text></View>
        ) : null}
        {pending ? <Icon name="pause-circle-outline" size={16} tone="warning" /> : null}
      </View>
      {status === 'free' ? (
        <Text variant="caption" tone="muted">{table.seats ? `${t('fnb.free')} · ${t('fnb.seats', { n: table.seats })}` : t('fnb.free')}</Text>
      ) : (
        <View>
          <Text variant="callout" className="font-bold" style={{ fontVariant: ['tabular-nums'] }}>{money(total)}</Text>
          <Text variant="caption" tone={status === 'billed' ? 'warning' : 'muted'} numberOfLines={1}>
            {[status === 'billed' ? t('fnb.billed') : null, oldest ? t('fnb.minutes', { n: minutesSince(oldest, now) }) : null, guests ? t('fnb.guests', { n: guests }) : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function Banner({ icon, tone, text }: { icon: any; tone: 'warning' | 'error' | 'info'; text: string }) {
  const bg = tone === 'warning' ? 'bg-warning-soft' : tone === 'error' ? 'bg-error-soft' : 'bg-info-soft';
  return (
    <View className={cn('flex-row items-center gap-2 rounded-2xl px-3.5 py-2.5', bg)}>
      <Icon name={icon} size={18} tone={tone === 'info' ? 'primary' : tone} />
      <Text variant="bodySmall" className="flex-1 font-semibold">{text}</Text>
    </View>
  );
}

export function FnbFloorScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();
  const { isTablet, isLandscape } = useResponsive();
  const split = isSplitPos({ isTablet, isLandscape });
  const branch = useWorkingBranch((s) => s.branch);
  const manyBranches = (useWorkingBranch((s) => s.options)?.length ?? 0) > 1;
  const branchId = branch?.id;

  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  const floorQ = useFnbFloor(branchId, focused);
  useFnbMenu(branchId); // tải sẵn thực đơn cho màn gọi món
  useFnbSync(branchId, floorQ.live ? floorQ.floor?.cursor ?? '' : undefined, focused);
  const entries = useFnbQueue((s) => s.entries);
  const now = useNow(15_000);

  const [areaId, setAreaId] = useState<string | null>(null);
  const [branchPick, setBranchPick] = useState(false);
  const [width, setWidth] = useState(0);

  const floor = floorQ.floor;
  const areas = useMemo(() => [...(floor?.areas ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [floor]);
  const tables = useMemo(() => tablesOf(floor, areaId), [floor, areaId]);
  const cols = gridColumns(width, isTablet ? 150 : 104, 3);
  const tile = tileWidth(width, cols);

  const unprinted = staleUnprinted(floor?.unprintedTickets ?? [], now).length;
  const attention = entries.filter((e) => e.state === 'attention' && !e.error?.blockedBy).length;
  const queued = entries.filter((e) => e.state === 'queued').length;

  function openNew(table: { id: string; name: string; areaName?: string } | null, shared = false) {
    openOrderScreen({
      id: newId(),
      tableId: table?.id,
      tableName: table?.name,
      areaName: table?.areaName,
      fresh: '1',
      shared: shared ? '1' : undefined,
    });
  }

  function openExisting(o: IOrderSummary) {
    openOrderScreen({ id: o.id });
  }

  function onTable(table: IFloorTable & { areaName: string }) {
    if (table.orders.length === 0) return openNew(table);
    if (table.orders.length === 1) return openExisting(table.orders[0]!);
    void showActionSheet({
      title: t('fnb.pickOrder', { table: table.name }),
      options: [
        ...table.orders.map((o) => ({ label: `${t('fnb.orderNo', { no: o.displayNo })} · ${money(o.total)}`, icon: 'receipt' as const, onPress: () => openExisting(o) })),
        { label: t('fnb.newSharedOrder'), icon: 'plus' as const, onPress: () => openNew(table, true) },
      ],
    });
  }

  const headerActions: HeaderAction[] = [{ icon: 'shopping-outline', onPress: () => openNew(null) }];
  if (manyBranches) headerActions.push({ icon: 'store-marker-outline', onPress: () => setBranchPick(true) });

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View className="px-4">
        <AppHeader back={split || !usesAdminShell(user)} title={t('fnb.title')} subtitle={branch?.name} actions={headerActions} />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: split ? Math.max(insets.bottom, 12) + 16 : TAB_CLEARANCE + insets.bottom }}
        refreshControl={<RefreshControl refreshing={floorQ.isRefetching} onRefresh={() => void floorQ.refetch()} />}
      >
        <View className="gap-2 mb-3">
          {unprinted ? <Banner icon="printer-alert" tone="warning" text={t('fnb.unprinted', { n: unprinted })} /> : null}
          {attention ? <Banner icon="alert-circle-outline" tone="error" text={t('fnb.attention', { n: attention })} /> : null}
          {queued ? <Banner icon="cloud-upload-outline" tone="info" text={t('fnb.syncing', { n: queued })} /> : null}
          {floorQ.data && !floorQ.live ? <Banner icon="information-outline" tone="info" text={t('fnb.floorLimited')} /> : null}
        </View>

        {areas.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pb-3">
            <Chip label={t('fnb.all')} selected={!areaId} color="primary" onPress={() => setAreaId(null)} />
            {areas.map((a) => (
              <Chip key={a.id} label={a.name} selected={areaId === a.id} color="primary" onPress={() => setAreaId(a.id)} />
            ))}
          </ScrollView>
        ) : null}

        {(floor?.takeawayOrders.length ?? 0) > 0 ? (
          <View className="gap-2 mb-3">
            <Text variant="label" tone="muted">{t('fnb.takeaway')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {floor!.takeawayOrders.map((o) => (
                <Chip key={o.id} icon="shopping-outline" label={`#${o.displayNo} · ${money(o.total)}`} color="primary" onPress={() => openExisting(o)} />
              ))}
            </View>
          </View>
        ) : null}

        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
          {floorQ.isLoading && !floor ? (
            <View className="w-full py-16"><Spinner /></View>
          ) : floorQ.isError && !floor ? (
            <View className="w-full"><EmptyState icon="wifi-off" title={t('fnb.loadFailed')} actionLabel={t('common.retry')} onAction={() => void floorQ.refetch()} /></View>
          ) : tables.length === 0 ? (
            <View className="w-full"><EmptyState icon="table-furniture" title={t('fnb.noTables')} description={t('fnb.noTablesHint')} /></View>
          ) : (
            tables.map((tb) => <TableTile key={tb.id} table={tb} width={tile} now={now} onPress={() => onTable(tb)} />)
          )}
        </View>
      </ScrollView>

      <WorkingBranchSheet visible={focused && branchPick} onClose={() => setBranchPick(false)} />
    </View>
  );
}

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getFnbAreas, getFnbFloorRaw, getFnbMenu, getFnbSyncRaw } from 'src/api/fnb';
import { useFeatureContext } from 'src/features/launcher/feature-context';
import { fnbVisible } from 'src/features/launcher/registry';
import { useWorkingBranch } from 'src/features/branch/working-branch';
import type { IFnbMenu } from 'src/types/fnb';

import { floorFromAreas } from './floor';
import { readFloorResponse, readSyncResponse, SYNC_FOREGROUND_MS, SYNC_IDLE_MS } from './fnb-sync';
import { useFnb } from './fnb-store';
import { fnbQueue } from './write-queue';

// ----------------------------------------------------------------------
// Hook dữ liệu F&B cho màn hình: quyền hiện F&B, thực đơn, sơ đồ bàn, vòng đồng bộ.
// ----------------------------------------------------------------------

/** F&B chỉ hiện khi cửa hàng có "commerce.fnb.pos" VÀ chi nhánh đang làm việc là loại "fnb". */
export function useFnbAccess() {
  const ctx = useFeatureContext();
  const branch = useWorkingBranch((s) => s.branch);
  return { visible: fnbVisible(ctx) && !!branch, branch };
}

export const fnbKeys = {
  menu: (branchId: string) => ['fnb', 'menu', branchId] as const,
  floor: (branchId: string) => ['fnb', 'floor', branchId] as const,
  order: (orderId: string) => ['fnb', 'order', orderId] as const,
};

export function useFnbMenu(branchId: string | undefined) {
  return useQuery<IFnbMenu>({
    queryKey: fnbKeys.menu(branchId ?? ''),
    queryFn: () => getFnbMenu(branchId!),
    enabled: !!branchId,
    staleTime: 5 * 60_000,
  });
}

/** Sơ đồ bàn; `live` = máy chủ có /fnb/floor (có đơn + cursor để đồng bộ). */
export function useFnbFloor(branchId: string | undefined, active: boolean) {
  const setFloor = useFnb((s) => s.setFloor);
  const q = useQuery({
    queryKey: fnbKeys.floor(branchId ?? ''),
    enabled: !!branchId,
    queryFn: async () => {
      const res = await getFnbFloorRaw(branchId!);
      const read = readFloorResponse(res.status, res.data);
      if (read.kind === 'ok') return { floor: read.floor, live: true };
      if (read.kind === 'unsupported') return { floor: floorFromAreas(branchId!, await getFnbAreas(branchId!)), live: false };
      throw read.body;
    },
    refetchInterval: (query) => (active && query.state.data && !query.state.data.live ? SYNC_IDLE_MS : false),
  });
  useEffect(() => {
    if (q.data) setFloor(q.data.floor);
  }, [q.data, setFloor]);
  const floor = useFnb((s) => (branchId ? s.floors[branchId] : undefined));
  return { ...q, floor, live: !!q.data?.live };
}

/**
 * Hỏi /fnb/sync theo nhịp (5 giây khi `active`, 15 giây khi không) và áp đơn / phiếu mới vào máy. Thực đơn hoặc
 * bàn đổi phiên bản → tải lại. Máy chủ chưa có /fnb/sync → dừng.
 */
export function useFnbSync(branchId: string | undefined, startCursor: string | null | undefined, active: boolean) {
  const qc = useQueryClient();
  const cursor = useRef<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      setAppActive(st === 'active');
      // Quay lại app: gửi ngay các lệnh đang chờ lùi giờ.
      if (st === 'active') fnbQueue.retryNow();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    cursor.current = startCursor || null;
  }, [branchId, startCursor]);

  useEffect(() => {
    if (!branchId || !supported || !appActive || startCursor === undefined) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      let more = true;
      while (more && !stopped) {
        more = false;
        let read;
        try {
          const res = await getFnbSyncRaw(branchId!, cursor.current);
          read = readSyncResponse(res.status, res.data);
        } catch {
          read = { kind: 'error' as const };
        }
        if (stopped) return;
        if (read.kind === 'unsupported') {
          setSupported(false);
          return;
        }
        if (read.kind === 'restart') {
          cursor.current = null;
          more = true;
          continue;
        }
        if (read.kind !== 'ok') break;
        const { sync } = read;
        cursor.current = sync.cursor;
        const store = useFnb.getState();
        store.applyOrders(sync.orders);
        store.applyTickets(sync.tickets);
        const menu = qc.getQueryData<IFnbMenu>(fnbKeys.menu(branchId!));
        if (menu && sync.menuVersion && menu.menuVersion !== sync.menuVersion) void qc.invalidateQueries({ queryKey: fnbKeys.menu(branchId!) });
        const floor = store.floors[branchId!];
        if (floor && sync.tablesVersion && floor.tablesVersion !== sync.tablesVersion) void qc.invalidateQueries({ queryKey: fnbKeys.floor(branchId!) });
        more = sync.hasMore;
      }
      if (!stopped) timer = setTimeout(tick, active ? SYNC_FOREGROUND_MS : SYNC_IDLE_MS);
    }

    timer = setTimeout(tick, active ? SYNC_FOREGROUND_MS : SYNC_IDLE_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [branchId, supported, appActive, active, startCursor, qc]);

  return { supported };
}

/** Đồng hồ cập nhật mỗi `ms` (số phút đã ngồi, phiếu chưa in quá 30 giây). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

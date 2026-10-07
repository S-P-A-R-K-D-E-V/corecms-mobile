import { useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { AuthContext } from 'src/auth/auth-context';
import { Loading } from 'src/components/shared';
import { getBranchLocations } from 'src/api/attendance';
import { useCart } from 'src/features/pos/cart-store';

import { currentStoreScope, hydrateStoreScope } from './store-scope';
import { useWorkingBranch } from './working-branch';

// ----------------------------------------------------------------------
// Cổng ngay dưới InternalAppGuard (đã đăng nhập, đã gắn cửa hàng): nạp chi nhánh đang làm việc + giỏ hàng của
// cửa hàng này từ máy TRƯỚC khi dựng thanh tab, rồi hỏi GET /branches để đối chiếu (tự chọn khi chỉ có một chi
// nhánh, đánh dấu cần chọn khi có nhiều / chi nhánh đã chọn không còn). Đọc máy chỉ mất vài mili-giây; không chờ
// mạng — mất mạng thì dùng chi nhánh đã lưu.
// ----------------------------------------------------------------------

/**
 * Hỏi danh sách chi nhánh (dùng chung cache với màn ghép kiosk) và đối chiếu với chi nhánh đã lưu, trong phạm vi chi
 * nhánh của người dùng — phạm vi đổi (quản lý phân công lại, nạp lại /users/me) thì đối chiếu lại.
 */
function WorkingBranchSync() {
  const reconcile = useWorkingBranch((s) => s.reconcile);
  // Không bắt buộc có AuthProvider (test dựng cổng riêng) — không có thì coi như mọi chi nhánh.
  const branchScope = useContext(AuthContext)?.user?.branchScope;
  const scopeKey = branchScope ? `${branchScope.allBranches}:${branchScope.branchIds.join(',')}` : 'all';
  const branchesQ = useQuery({ queryKey: ['branches'], queryFn: getBranchLocations, staleTime: 10 * 60_000 });
  useEffect(() => {
    if (branchesQ.data) reconcile(branchesQ.data, branchScope);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- branchScope đổi được nhận qua scopeKey
  }, [branchesQ.data, reconcile, scopeKey]);
  return null;
}

export function StoreScopeGate({ children }: { children: React.ReactNode }) {
  const scope = currentStoreScope();
  const branchReady = useWorkingBranch((s) => s.hydrated && s.scope === scope);
  const cartReady = useCart((s) => s.hydrated && s.scope === scope);

  useEffect(() => {
    void hydrateStoreScope(scope);
  }, [scope]);

  if (!branchReady || !cartReady) return <Loading />;
  return (
    <>
      <WorkingBranchSync />
      {children}
    </>
  );
}

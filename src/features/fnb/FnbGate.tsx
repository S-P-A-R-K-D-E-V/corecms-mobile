import { Redirect } from 'expo-router';

import { Loading } from 'src/components/shared';
import { useWorkingBranch } from 'src/features/branch/working-branch';

import { useFnbAccess } from './use-fnb';

// ----------------------------------------------------------------------
// Cổng các route F&B: chỉ vào được khi cửa hàng bật "commerce.fnb.pos" VÀ chi nhánh đang làm việc là F&B.
// Không đủ điều kiện → về trang chủ, không hiện chữ F&B nào.
// ----------------------------------------------------------------------

export function FnbGate({ children }: { children: React.ReactNode }) {
  const hydrated = useWorkingBranch((s) => s.hydrated);
  const { visible } = useFnbAccess();
  if (!hydrated) return <Loading />;
  if (!visible) return <Redirect href="/(tabs)/home" />;
  return <>{children}</>;
}

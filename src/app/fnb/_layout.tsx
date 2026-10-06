import { Stack } from 'expo-router';
import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { FnbGate } from 'src/features/fnb/FnbGate';

// F&B (gọi món tại bàn): chỉ khi cửa hàng bật commerce.fnb.pos và chi nhánh đang làm việc là F&B.
export default function FnbLayout() {
  return (
    <InternalAppGuard>
      <FnbGate>
        <Stack screenOptions={{ headerShown: false }} />
      </FnbGate>
    </InternalAppGuard>
  );
}

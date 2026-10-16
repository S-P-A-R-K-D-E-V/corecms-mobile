import { RoleGuard } from 'src/auth/role-guard';
import { SHIFT_CASH_ROLES } from 'src/auth/roles';
import { ShiftCashScreen } from 'src/features/shift-cash/ShiftCashScreen';
import { ShiftCashAccessGate } from 'src/features/shift-cash/AccessGate';
import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';

export default function ShiftCash() {
  // Phân quyền (Staff/Manager/Admin) → cổng kiểm quầy (Admin vào thẳng; còn lại: ca hôm nay + GPS ở
  // cửa hàng) → màn chính.
  return (
    <RoleGuard roles={SHIFT_CASH_ROLES}>
      <PlatformFeatureGate feature={PLATFORM_FEATURES.shiftCash} label="Kiểm quầy">
        <ShiftCashAccessGate>
          <ShiftCashScreen />
        </ShiftCashAccessGate>
      </PlatformFeatureGate>
    </RoleGuard>
  );
}

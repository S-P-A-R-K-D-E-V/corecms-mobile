import { RoleGuard } from 'src/auth/role-guard';
import { SHIFT_CASH_ROLES } from 'src/auth/roles';
import { ShiftCashScreen } from 'src/features/shift-cash/ShiftCashScreen';
import { ShiftCashGpsGate } from 'src/features/shift-cash/GpsGate';

export default function ShiftCash() {
  // Phân quyền (Staff/Manager/Admin) → cổng GPS (giống check-in) → màn chính.
  return (
    <RoleGuard roles={SHIFT_CASH_ROLES}>
      <ShiftCashGpsGate>
        <ShiftCashScreen />
      </ShiftCashGpsGate>
    </RoleGuard>
  );
}

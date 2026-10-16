import { useMemo } from 'react';

import { useAuthContext } from 'src/auth/auth-context';
import type { AuthUser } from 'src/auth/auth-context';
import { PERMISSIONS, hasAllPermissions } from 'src/auth/permissions';

// ----------------------------------------------------------------------
// Quyền ở các màn quản lý lương — khớp Core-be (payroll.*) và core-fe (src/sections/payroll/payroll-access.ts).
// Thao tác ghi cần quyền riêng + quyền xem. Mặc định Admin đủ hết; Manager: xem, lập lệnh chi, miễn phạt, tạo / khoá kỳ,
// sửa cấu hình lương — không chốt, không xác nhận đã chi, không tính lại / tạo bảng lương hàng loạt, không công bố kỳ.
// ----------------------------------------------------------------------

const P = PERMISSIONS.payroll;

export function payrollAccessFor(user: AuthUser | null | undefined) {
  const records = (...codes: string[]) => hasAllPermissions(user, [P.recordsRead, ...codes]);
  return {
    canReadRecords: records(),
    /** Tạo kỳ trong app kèm tạo bảng lương hàng loạt → cần cả hai quyền. */
    canCreateCycle: records(P.cycleManage, P.recalculate, P.salaryConfigRead),
    canRecalculate: records(P.recalculate, P.salaryConfigRead),
    canFinalize: records(P.finalize),
    canPreparePayment: records(P.paymentPrepare),
    canMarkPaid: records(P.markPaid),
    canPublishCycle: records(P.cyclePublish),
    canManagePenalty: records(P.penaltyManage),
    canManageSalaryConfig: hasAllPermissions(user, [P.salaryConfigRead, P.salaryConfigManage]),
  };
}

export type PayrollAccess = ReturnType<typeof payrollAccessFor>;

export function usePayrollAccess(): PayrollAccess {
  const { user } = useAuthContext();
  return useMemo(() => payrollAccessFor(user), [user]);
}

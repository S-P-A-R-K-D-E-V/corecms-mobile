import { useQuery } from '@tanstack/react-query';
import { getMyPayroll, getPayrollPenaltyDetails, getPayrollShiftDetails } from 'src/api/payroll';
import { formatMoney } from 'src/i18n/format';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';
import { usePlatformFeatureAllowed } from 'src/auth/use-platform-feature';

export function useMyPayroll() {
  const enabled = usePlatformFeatureAllowed(PLATFORM_FEATURES.payrollSelf);
  return useQuery({ queryKey: ['payroll', 'mine'], queryFn: getMyPayroll, enabled });
}

export function usePayrollShiftDetails(id: string) {
  return useQuery({
    queryKey: ['payroll', 'shift-details', id],
    queryFn: () => getPayrollShiftDetails(id),
    enabled: !!id,
  });
}

export function usePayrollPenaltyDetails(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['payroll', 'penalty-details', id],
    queryFn: () => getPayrollPenaltyDetails(id),
    enabled: !!id && enabled,
  });
}

export function fmtMoney(v?: number): string {
  return formatMoney(v);
}

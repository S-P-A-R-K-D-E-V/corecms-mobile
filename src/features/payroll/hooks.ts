import { useQuery } from '@tanstack/react-query';
import { getMyPayroll, getPayrollPenaltyDetails, getPayrollShiftDetails } from 'src/api/payroll';
import { formatMoney } from 'src/i18n/format';

export function useMyPayroll() {
  return useQuery({ queryKey: ['payroll', 'mine'], queryFn: getMyPayroll });
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

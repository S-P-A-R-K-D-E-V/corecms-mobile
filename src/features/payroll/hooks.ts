import { useQuery } from '@tanstack/react-query';
import { getMyPayroll, getPayrollShiftDetails } from 'src/api/payroll';

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

export function fmtMoney(v?: number): string {
  return v != null ? `${v.toLocaleString('vi-VN')}đ` : '0đ';
}

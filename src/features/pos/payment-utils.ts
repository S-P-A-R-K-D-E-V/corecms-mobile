import type { IBankAccount } from 'src/types/erp';

/** Gợi ý tiền khách đưa: đủ tiền + làm tròn lên các mệnh giá hay gặp. */
export function cashSuggestions(total: number): number[] {
  const out = new Set<number>([total]);
  for (const step of [10_000, 50_000, 100_000, 200_000, 500_000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

export function vietQrUrl(account: IBankAccount, amount: number, ref: string): string | null {
  if (!account.bin || !account.accountNumber) return null;
  return `https://img.vietqr.io/image/${account.bin}-${account.accountNumber}-compact2.png?amount=${Math.round(amount)}&addInfo=${encodeURIComponent(ref)}`;
}

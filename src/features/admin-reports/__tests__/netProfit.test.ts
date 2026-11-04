import { netProfitOf } from '../hooks';

describe('netProfitOf', () => {
  it('trừ chi phí vận hành gồm lương, không phải chi phí đã nhập', () => {
    expect(netProfitOf(85_000_000, { total: 62_600_000 })).toBe(22_400_000);
  });

  it('chưa có chi phí thì bằng lãi gộp', () => {
    expect(netProfitOf(1_000_000, undefined)).toBe(1_000_000);
  });
});

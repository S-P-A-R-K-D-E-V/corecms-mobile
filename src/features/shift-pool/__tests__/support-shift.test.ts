import { supportPayText } from '../SupportShiftCard';

describe('supportPayText', () => {
  it('shows the template rate with the minimum hours', () => {
    const text = supportPayText({ fixedHourlyRate: 38500, minimumPaidHours: 1.5 });
    expect(text).toContain('/giờ');
    expect(text).toContain('trả tối thiểu 1,5 giờ');
  });

  it('falls back to the person’s own hourly pay when no rate is set', () => {
    expect(supportPayText({ fixedHourlyRate: null, minimumPaidHours: null })).toBe('Trả theo lương giờ của bạn');
  });
});

import { parseInline } from '../RichText';

describe('parseInline', () => {
  it('tách đậm, nghiêng, mã', () => {
    expect(parseInline('Doanh thu **4.850.000đ** hôm nay, _tăng 12%_, mã `HD001`')).toEqual([
      { text: 'Doanh thu ' },
      { text: '4.850.000đ', bold: true },
      { text: ' hôm nay, ' },
      { text: 'tăng 12%', italic: true },
      { text: ', mã ' },
      { text: 'HD001', code: true },
    ]);
  });

  it('không coi phép nhân có khoảng trắng là in nghiêng', () => {
    expect(parseInline('3 * 4 * 5')).toEqual([{ text: '3 * 4 * 5' }]);
  });
});

import {
  DEFAULT_PRIMARY,
  applyBrandColor,
  buildPrimaryPalette,
  contrastRatio,
  getPrimaryPalette,
  paletteVars,
  parseHex,
} from '../brand-color';

const WHITE: [number, number, number] = [255, 255, 255];

describe('buildPrimaryPalette', () => {
  it('hồng CiCi giữ đúng bảng tinh chỉnh tay', () => {
    const p = buildPrimaryPalette(DEFAULT_PRIMARY);
    expect(p.main).toBe('#C84D71');
    expect(p[700]).toBe('#AC3C5D');
    expect(p.dark).toBe('#E97AA0');
  });

  it.each([null, undefined, '', 'blue', '#12', 'rgb(1,2,3)'])('mã không hợp lệ %p → hồng CiCi', (hex) => {
    expect(buildPrimaryPalette(hex as any).main).toBe('#C84D71');
  });

  it('màu cửa hàng (xanh MUI) sinh dải sáng → tối, main giữ nguyên', () => {
    const p = buildPrimaryPalette('#1976d2');
    expect(p.main).toBe('#1976D2');
    const lum = (hex: string) => {
      const [r, g, b] = parseHex(hex)!;
      return r + g + b;
    };
    expect(lum(p[50])).toBeGreaterThan(lum(p[100]));
    expect(lum(p[100])).toBeGreaterThan(lum(p[400]));
    expect(lum(p[400])).toBeGreaterThan(lum(p.main));
    expect(lum(p.main)).toBeGreaterThan(lum(p[700]));
    expect(lum(p[700])).toBeGreaterThan(lum(p[900]));
    expect(lum(p.dark)).toBeGreaterThan(lum(p.main));
  });

  it.each(['#FFEB3B', '#B2EBF2', '#ffffff', '#FFD666'])('màu quá sáng %s được làm đậm tới khi chữ trắng đọc được', (hex) => {
    const p = buildPrimaryPalette(hex);
    expect(contrastRatio(parseHex(p.main)!, WHITE)).toBeGreaterThanOrEqual(3);
  });

  it('nhận #RGB', () => {
    expect(buildPrimaryPalette('#06c').main).toBe('#0066CC');
  });
});

describe('paletteVars', () => {
  it('kênh "r g b" cho mọi biến tokens.js dùng', () => {
    const v = paletteVars(buildPrimaryPalette('#1976d2'));
    expect(v['--color-primary']).toBe('25 118 210');
    expect(Object.keys(v)).toEqual(
      expect.arrayContaining([
        '--color-primary-50',
        '--color-primary-100',
        '--color-primary-200',
        '--color-primary-400',
        '--color-primary-700',
        '--color-primary-900',
        '--color-primary-lighter',
        '--color-primary-light',
        '--color-primary-darker',
        '--color-primary-dark',
      ])
    );
    for (const value of Object.values(v)) expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });
});

describe('applyBrandColor', () => {
  it('đổi màu đang dùng; null → mặc định', () => {
    applyBrandColor('#1976d2');
    expect(getPrimaryPalette().main).toBe('#1976D2');
    applyBrandColor(null);
    expect(getPrimaryPalette().main).toBe('#C84D71');
  });
});

import {
  MAX_PRODUCT_IMAGES,
  append,
  canEditProductImages,
  defaultPreset,
  makePrimary,
  move,
  remove,
  sameOrder,
  toggleTag,
} from '../product-images';

describe('bộ ảnh sản phẩm', () => {
  const urls = ['a', 'b', 'c'];

  it('đặt ảnh chính, đổi chỗ, xoá', () => {
    expect(makePrimary(urls, 'c')).toEqual(['c', 'a', 'b']);
    expect(move(urls, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(move(urls, 'c', 1)).toBe(urls);
    expect(remove(urls, 'a')).toEqual(['b', 'c']);
  });

  it('thêm bỏ trùng, tối đa 12 ảnh', () => {
    expect(append(urls, ['a', 'd'])).toEqual({ urls: ['a', 'b', 'c', 'd'], dropped: 0 });
    const full = Array.from({ length: MAX_PRODUCT_IMAGES }, (_, i) => `u${i}`);
    expect(append(full, ['x'])).toEqual({ urls: full, dropped: 1 });
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('tag tối đa 6, gợi ý mặc định là cách dùng đầu tiên', () => {
    const six = ['1', '2', '3', '4', '5', '6'];
    expect(toggleTag(six, '7')).toBe(six);
    expect(toggleTag(six, '3')).toEqual(['1', '2', '4', '5', '6']);
    expect(
      defaultPreset([
        { id: 'white', label: 'Nền trắng', group: 'studio', hint: '' },
        { id: 'hair-side', label: 'Cài bên tai', group: 'lifestyle', hint: '' },
      ])
    ).toBe('hair-side');
    expect(defaultPreset([])).toBeNull();
  });

  it('chỉ người có products.update, không ở máy quầy', () => {
    const owner = { permissions: ['products.update'] } as any;
    expect(canEditProductImages(owner, false)).toBe(true);
    expect(canEditProductImages(owner, true)).toBe(false);
    expect(canEditProductImages({ permissions: [] } as any, false)).toBe(false);
  });
});

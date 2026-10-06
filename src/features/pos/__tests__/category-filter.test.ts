import axios from 'src/api/axios';
import { getCategories, getProducts } from 'src/api/erp';
import type { ICategory } from 'src/types/erp';

import { activeCategoryId, hasCategoryFilter, posCategories } from '../category-filter';

// Hàng chip lọc nhóm hàng ở khung chọn hàng: nhóm lấy từ GET /categories, lọc do core-be làm qua
// GET /products?categoryId=… (đúng nhóm được chọn).

const cat = (id: string, name: string, over: Partial<ICategory> = {}): ICategory => ({ id, name, isActive: true, ...over });

describe('nhóm hàng cho hàng chip', () => {
  it('chỉ nhóm đang dùng, nhóm con đứng ngay sau nhóm cha, giữ thứ tự API trong từng cấp', () => {
    const list = [
      cat('a', 'Áo'),
      cat('a1', 'Áo thun', { parentCategoryId: 'a' }),
      cat('k', 'Kẹp tóc'),
      cat('old', 'Hàng cũ', { isActive: false }),
      cat('a2', 'Áo khoác', { parentCategoryId: 'a' }),
      cat('p', 'Phụ kiện'),
    ];
    expect(posCategories(list)).toEqual([
      { id: 'a', name: 'Áo' },
      { id: 'a1', name: 'Áo thun' },
      { id: 'a2', name: 'Áo khoác' },
      { id: 'k', name: 'Kẹp tóc' },
      { id: 'p', name: 'Phụ kiện' },
    ]);
  });

  it('danh sách phẳng kèm sẵn subCategories → mỗi nhóm chỉ một chip', () => {
    const child = cat('a1', 'Áo thun', { parentCategoryId: 'a' });
    const list = [cat('a', 'Áo', { subCategories: [child] }), child, cat('k', ' Kẹp tóc ')];
    expect(posCategories(list).map((c) => c.id)).toEqual(['a', 'a1', 'k']);
    expect(posCategories(list)[2]!.name).toBe('Kẹp tóc');
  });

  it('nhóm cha đã ẩn: nhóm con còn dùng vẫn hiện như nhóm gốc; nhóm không tên bị bỏ', () => {
    const list = [cat('x', 'Đã ẩn', { isActive: false }), cat('x1', 'Còn bán', { parentCategoryId: 'x' }), cat('e', '  ')];
    expect(posCategories(list)).toEqual([{ id: 'x1', name: 'Còn bán' }]);
  });

  it('dữ liệu lạ không làm treo hay ném lỗi (vòng cha ↔ con, null, thiếu id)', () => {
    const loop = [cat('m', 'M', { parentCategoryId: 'n' }), cat('n', 'N', { parentCategoryId: 'm' })];
    expect(posCategories(loop).map((c) => c.id).sort()).toEqual(['m', 'n']);
    expect(posCategories(null)).toEqual([]);
    expect(posCategories([null as any, { name: 'thiếu id', isActive: true } as any])).toEqual([]);
  });

  it('dưới 2 nhóm thì không hiện hàng chip', () => {
    expect(hasCategoryFilter([])).toBe(false);
    expect(hasCategoryFilter([{ id: 'a', name: 'Áo' }])).toBe(false);
    expect(hasCategoryFilter(posCategories([cat('a', 'Áo'), cat('k', 'Kẹp tóc')]))).toBe(true);
  });

  it('nhóm đang lọc bị ẩn / xoá → bỏ lọc, hiện tất cả', () => {
    const categories = posCategories([cat('a', 'Áo'), cat('k', 'Kẹp tóc')]);
    expect(activeCategoryId('k', categories)).toBe('k');
    expect(activeCategoryId('gone', categories)).toBeNull();
    expect(activeCategoryId(null, categories)).toBeNull();
  });
});

describe('gọi API', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lọc nhóm gửi categoryId cho core-be; không chọn nhóm thì không gửi', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [], totalCount: 0 } });

    await getProducts({ keyword: ' kẹp ', categoryId: 'k', page: 2, pageSize: 30 });
    expect(get).toHaveBeenLastCalledWith('/products', { params: { isActive: true, page: 2, pageSize: 30, keyword: 'kẹp', categoryId: 'k' } });

    await getProducts({ keyword: '' });
    expect(get).toHaveBeenLastCalledWith('/products', { params: { isActive: true, page: 1, pageSize: 30, keyword: undefined, categoryId: undefined } });
  });

  it('nhóm hàng lấy từ GET /categories', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue({ data: [cat('a', 'Áo')] });
    await expect(getCategories()).resolves.toEqual([cat('a', 'Áo')]);
    expect(get).toHaveBeenCalledWith('/categories');
  });
});

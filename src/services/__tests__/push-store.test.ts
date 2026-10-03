import {
  STORE_REPOST_FLAG,
  decidePushTap,
  foreignStoreRepost,
  isSameStore,
  isStoreRepost,
  parsePushData,
  pushStoreLabel,
  storePrefixedTitle,
} from '../push-store';

describe('đọc data của push', () => {
  it('đọc tenantId / storeCode / storeName (mã cửa hàng về chữ thường) + category', () => {
    expect(
      parsePushData({ category: 'Shift', tenantId: 't-1', storeCode: ' TiemTocABC ', storeName: 'Tiệm Tóc ABC', conversationId: 'c1' })
    ).toEqual({ category: 'Shift', conversationId: 'c1', tenantId: 't-1', storeCode: 'tiemtocabc', storeName: 'Tiệm Tóc ABC' });
  });

  it('push cũ chưa có trường cửa hàng → null; category lấy từ type nếu thiếu', () => {
    expect(parsePushData({ type: 'Messenger', conversationId: 'c1' })).toEqual({
      category: 'Messenger',
      conversationId: 'c1',
      tenantId: null,
      storeCode: null,
      storeName: null,
    });
  });

  it('chấp nhận tên PascalCase (server .NET) và data dạng chuỗi JSON', () => {
    expect(parsePushData({ TenantId: 't-2', StoreCode: 'Shop2', StoreName: 'Tiệm 2' })).toMatchObject({
      tenantId: 't-2',
      storeCode: 'shop2',
      storeName: 'Tiệm 2',
    });
    expect(parsePushData('{"storeCode":"shop3","storeName":"Tiệm 3"}')).toMatchObject({ storeCode: 'shop3', storeName: 'Tiệm 3' });
  });

  it('data hỏng / rỗng / sai kiểu → không có gì, không ném lỗi', () => {
    const empty = { category: null, conversationId: null, tenantId: null, storeCode: null, storeName: null };
    for (const data of [undefined, null, '', '{hỏng', 42, ['shop1'], { storeCode: '   ', storeName: {} }]) {
      expect(parsePushData(data)).toEqual(empty);
    }
    expect(parsePushData({ tenantId: 12 }).tenantId).toBe('12');
  });
});

describe('cùng cửa hàng hay không', () => {
  it('so mã cửa hàng không phân biệt hoa thường', () => {
    expect(isSameStore({ storeCode: 'shop1' }, 'shop1')).toBe(true);
    expect(isSameStore({ storeCode: 'shop1' }, 'SHOP1')).toBe(true);
    expect(isSameStore({ storeCode: 'shop2' }, 'shop1')).toBe(false);
  });

  it('thiếu trường (push cũ) hoặc app chưa gắn cửa hàng (bản CiCi) → coi như cùng cửa hàng', () => {
    expect(isSameStore({ storeCode: null }, 'shop1')).toBe(true);
    expect(isSameStore({ storeCode: 'cici' }, null)).toBe(true);
    expect(isSameStore({ storeCode: 'cici' }, undefined)).toBe(true);
    expect(isSameStore({ storeCode: 'cici' }, '  ')).toBe(true);
  });

  it('tên hiển thị: tên cửa hàng, thiếu thì mã', () => {
    expect(pushStoreLabel({ storeName: 'Tiệm 2', storeCode: 'shop2' })).toBe('Tiệm 2');
    expect(pushStoreLabel({ storeName: null, storeCode: 'shop2' })).toBe('shop2');
  });
});

describe('chạm vào push', () => {
  it('push của cửa hàng khác → không mở link, báo tên cửa hàng', () => {
    const decision = decidePushTap({ storeCode: 'shop2', storeName: 'Tiệm 2', category: 'Shift' }, 'shop1');
    expect(decision).toMatchObject({ kind: 'otherStore', storeLabel: 'Tiệm 2' });
    expect(decidePushTap({ storeCode: 'shop2' }, 'shop1')).toMatchObject({ kind: 'otherStore', storeLabel: 'shop2' });
  });

  it('cùng cửa hàng / push cũ / chưa gắn cửa hàng → hành vi cũ', () => {
    expect(decidePushTap({ storeCode: 'shop1', storeName: 'Tiệm 1' }, 'shop1').kind).toBe('sameStore');
    expect(decidePushTap({ category: 'Payroll' }, 'shop1').kind).toBe('sameStore');
    expect(decidePushTap({ storeCode: 'shop2' }, null).kind).toBe('sameStore');
    expect(decidePushTap(undefined, 'shop1').kind).toBe('sameStore');
  });
});

describe('push cửa hàng khác lúc đang mở app', () => {
  it('tiêu đề có tên cửa hàng đứng trước', () => {
    expect(storePrefixedTitle('Ca làm sắp bắt đầu', 'Tiệm 2')).toBe('Tiệm 2 · Ca làm sắp bắt đầu');
    expect(storePrefixedTitle('  ', 'Tiệm 2')).toBe('Tiệm 2');
    expect(storePrefixedTitle(null, 'Tiệm 2')).toBe('Tiệm 2');
    expect(storePrefixedTitle('Ca làm', '')).toBe('Ca làm');
  });

  it('cửa hàng khác → hiện lại bản có tên cửa hàng, giữ data + cờ đã hiện lại', () => {
    const repost = foreignStoreRepost(
      { title: 'Tin nhắn mới', body: 'Lan: chào', data: { category: 'Messenger', conversationId: 'c9', storeCode: 'shop2', storeName: 'Tiệm 2' } },
      'shop1'
    );
    expect(repost).toEqual({
      title: 'Tiệm 2 · Tin nhắn mới',
      body: 'Lan: chào',
      data: { category: 'Messenger', conversationId: 'c9', storeCode: 'shop2', storeName: 'Tiệm 2', [STORE_REPOST_FLAG]: true },
    });
    expect(isStoreRepost(repost!.data)).toBe(true);
    // Bản hiện lại tới handler lần nữa → hiện như thường, không lặp.
    expect(foreignStoreRepost({ title: repost!.title, body: repost!.body, data: repost!.data }, 'shop1')).toBeNull();
  });

  it('cùng cửa hàng / push cũ → không hiện lại', () => {
    expect(foreignStoreRepost({ title: 'A', data: { storeCode: 'shop1' } }, 'shop1')).toBeNull();
    expect(foreignStoreRepost({ title: 'A', data: { category: 'Shift' } }, 'shop1')).toBeNull();
    expect(foreignStoreRepost({ title: 'A', data: { storeCode: 'shop2' } }, null)).toBeNull();
    expect(isStoreRepost({ category: 'Shift' })).toBe(false);
    expect(foreignStoreRepost({ title: 'A', data: { storeCode: 'shop2' } }, 'shop1')).toMatchObject({ body: null });
  });
});

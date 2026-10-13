let mockN = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `ID-${++mockN}` }));
jest.mock('src/api/axios', () => ({
  __esModule: true,
  default: {},
  endpoints: { fnb: { orderLine: (id: string, lineId: string) => `/fnb/orders/${id}/lines/${lineId}` } },
}));
jest.mock('src/api/fnb', () => ({ getFnbOrder: jest.fn() }));

import type { IMenuDish } from 'src/types/fnb';

import { addDraft, comboComponents, draftTotal, itemDraft, lineSeed, replaceDraft, toLineInput } from '../draft';
import { replaceLineCmd, type ItemLineInput } from '../fnb-commands';
import { componentTitle, dishNeedsOptions } from '../menu';

// Combo trên app — cùng luật với web (core-fe src/sections/fnb-pos/lib/draft.ts).

const option = (productId: string, name: string, over: object = {}) => ({
  productId,
  dishId: `dish-${productId}`,
  name,
  variantName: null as string | null,
  quantity: 1,
  price: 30_000,
  surcharge: 0,
  isSoldOut: false,
  sortOrder: 1,
  ...over,
});

// Combo sáng 45 000: đồ uống (Bạc xỉu mặc định, hoặc Cà phê sữa L +5 000) + Bánh flan cố định.
const combo: IMenuDish = {
  id: 'combo',
  categoryId: 'c1',
  code: 'CB',
  name: 'Combo sáng',
  imageUrl: null,
  sortOrder: 1,
  isSoldOut: false,
  priceFrom: 45_000,
  variants: [{ productId: 'combo', name: null, price: 45_000, isSoldOut: false, sortOrder: 1 }],
  toppingIds: ['tp'],
  combo: {
    groups: [
      {
        id: 'drinks',
        name: 'Đồ uống',
        sortOrder: 1,
        options: [
          option('bx', 'Bạc xỉu'),
          option('cfl', 'Cà phê sữa', { variantName: 'L', price: 35_000, surcharge: 5_000, sortOrder: 2 }),
        ],
      },
      { id: 'cakes', name: 'Bánh', sortOrder: 2, options: [option('flan', 'Bánh flan', { price: 25_000 })] },
    ],
  },
};
const variant = combo.variants[0];
const plain: IMenuDish = { ...combo, id: 'bx', name: 'Bạc xỉu', toppingIds: [], combo: null };

describe('lựa chọn của combo', () => {
  it('nhóm chưa chọn lấy lựa chọn đầu; chọn rồi thì theo lựa chọn; món thường không có thành phần', () => {
    expect(comboComponents(combo).map((c) => c.productId)).toEqual(['bx', 'flan']);
    expect(comboComponents(combo, { drinks: 'cfl' }).map((c) => [c.productId, c.variantName, c.surcharge])).toEqual([
      ['cfl', 'L', 5_000],
      ['flan', null, 0],
    ]);
    expect(comboComponents(plain)).toEqual([]);
  });

  it('lựa chọn mặc định đã hết thì lấy lựa chọn còn bán kế tiếp', () => {
    const groups = combo.combo!.groups;
    const soldOut: IMenuDish = {
      ...combo,
      combo: { groups: [{ ...groups[0], options: [option('bx', 'Bạc xỉu', { isSoldOut: true }), groups[0].options[1]] }, groups[1]] },
    };
    expect(comboComponents(soldOut)[0].productId).toBe('cfl');
  });

  it('combo có nhóm nhiều lựa chọn mới cần mở bảng chọn', () => {
    expect(dishNeedsOptions(undefined, combo)).toBe(true);
    expect(dishNeedsOptions(undefined, { ...combo, combo: { groups: [combo.combo!.groups[1]] } })).toBe(false);
  });

  it('tên thành phần có size và số lượng', () => {
    expect(componentTitle({ name: 'Cà phê sữa', variantName: 'L', quantity: 1 })).toBe('Cà phê sữa (L)');
    expect(componentTitle({ name: 'Bánh flan', variantName: null, quantity: 2 })).toBe('Bánh flan ×2');
  });
});

describe('dòng combo đang chọn', () => {
  it('giá = giá combo + phụ thu, không nhận món thêm', () => {
    const base = itemDraft(combo, variant, { toppings: [{ productId: 'tp', name: 'Trân châu', quantity: 1, unitPrice: 5_000 }] });
    expect([base.unitPrice, base.toppings.length, base.components.length]).toEqual([45_000, 0, 2]);

    const upsized = itemDraft(combo, variant, { quantity: 2, components: comboComponents(combo, { drinks: 'cfl' }) });
    expect(upsized.unitPrice).toBe(50_000);
    expect(draftTotal([base, upsized])).toBe(145_000);
  });

  it('cùng lựa chọn thì cộng số lượng, khác lựa chọn thì thành dòng riêng', () => {
    let drafts = addDraft([], itemDraft(combo, variant));
    drafts = addDraft(drafts, itemDraft(combo, variant));
    drafts = addDraft(drafts, itemDraft(combo, variant, { components: comboComponents(combo, { drinks: 'cfl' }) }));
    expect(drafts.map((d) => d.quantity)).toEqual([2, 1]);
  });

  it('gửi lựa chọn của từng nhóm; món thường không gửi components', () => {
    const input = toLineInput(itemDraft(combo, variant, { components: comboComponents(combo, { drinks: 'cfl' }) }));
    expect(input).toMatchObject({
      productId: 'combo',
      toppings: [],
      components: [
        { groupId: 'drinks', productId: 'cfl' },
        { groupId: 'cakes', productId: 'flan' },
      ],
    });
    expect('components' in toLineInput(itemDraft(plain, plain.variants[0]))).toBe(false);
  });
});

describe('sửa lựa chọn của dòng chưa gửi', () => {
  const held = itemDraft(combo, variant, { quantity: 2, components: comboComponents(combo, { drinks: 'cfl' }), quickNotes: ['Ít đá'], note: 'mang ra sau' });

  it('mở lại bảng chọn với đúng lựa chọn, số lượng và ghi chú của dòng (món đang chọn lẫn dòng trên máy chủ)', () => {
    expect(lineSeed(held)).toEqual({
      variantId: 'combo',
      quantity: 2,
      toppings: {},
      choices: { drinks: 'cfl', cakes: 'flan' },
      quickNotes: ['Ít đá'],
      note: 'mang ra sau',
    });
    // Dòng máy chủ của món thường: không có `components`, món thêm theo số phần.
    expect(lineSeed({ productId: 'bx', quantity: 1, toppings: [{ productId: 'tp', quantity: 2 }], quickNotes: [], note: null })).toEqual({
      variantId: 'bx',
      quantity: 1,
      toppings: { tp: 2 },
      choices: {},
      quickNotes: [],
      note: '',
    });
    // Lựa chọn dựng lại từ seed cho ra đúng các thành phần cũ.
    expect(comboComponents(combo, lineSeed(held).choices)).toEqual(held.components);
  });

  it('thay món đang chọn tại chỗ, giữ id và vị trí', () => {
    const other = itemDraft(plain, variant);
    const edited = itemDraft(combo, variant, { quantity: 3, components: comboComponents(combo, { drinks: 'bx' }) });
    const next = replaceDraft([held, other], held.id, edited);
    expect(next.map((l) => l.id)).toEqual([held.id, other.id]);
    expect(next[0]).toMatchObject({ quantity: 3, unitPrice: 45_000, quickNotes: [], note: null });
    expect(next[0].components.map((c) => c.productId)).toEqual(['bx', 'flan']);
    // Dòng không còn (đã gửi trong lúc sửa) thì không đổi gì.
    expect(replaceDraft([other], held.id, edited)).toEqual([other]);
  });

  it('sửa xong trùng hệt một dòng khác thì gộp số lượng', () => {
    const twin = itemDraft(combo, variant, { quantity: 1, components: comboComponents(combo, { drinks: 'bx' }) });
    const edited = itemDraft(combo, variant, { quantity: 2, components: comboComponents(combo, { drinks: 'bx' }) });
    const next = replaceDraft([held, twin], held.id, edited);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: twin.id, quantity: 3 });
  });

  it('lệnh sửa dòng: PUT đúng dòng, gửi lựa chọn mới, không gửi giá hay id dòng mới', () => {
    const edited = itemDraft(combo, variant, { quantity: 2, components: comboComponents(combo, { drinks: 'cfl' }), note: 'ít ngọt' });
    const cmd = replaceLineCmd({ deviceId: 'dev-1', now: new Date('2026-10-13T03:00:00Z') }, 'o-1', 'l-9', toLineInput(edited) as ItemLineInput);
    expect(cmd).toMatchObject({ kind: 'replaceLine', orderIds: ['o-1'], method: 'PUT', path: '/fnb/orders/o-1/lines/l-9' });
    expect(cmd.body).toMatchObject({
      deviceId: 'dev-1',
      productId: 'combo',
      quantity: 2,
      toppings: [],
      quickNotes: [],
      note: 'ít ngọt',
      components: [
        { groupId: 'drinks', productId: 'cfl' },
        { groupId: 'cakes', productId: 'flan' },
      ],
    });
    expect(cmd.body).not.toHaveProperty('id');
    expect(cmd.body).not.toHaveProperty('unitPrice');
    expect(cmd.body).not.toHaveProperty('baseVersion');
    // Món thường: không gửi `components`.
    const plainCmd = replaceLineCmd({ deviceId: 'dev-1' }, 'o-1', 'l-1', toLineInput(itemDraft(plain, variant)) as ItemLineInput);
    expect(plainCmd.body).not.toHaveProperty('components');
  });
});

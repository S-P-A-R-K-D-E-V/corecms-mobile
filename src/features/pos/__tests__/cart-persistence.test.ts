import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SaleHttpResult } from 'src/api/erp';

import { CART_TTL_MS, cartKey, cartTotal, mergeLines, parseSavedCart, serializeCart, useCart, type CartLine } from '../cart-store';
import { sendSale } from '../checkout';
import { buildSaleDraft, type SaleRequest } from '../sale-request';

// Giỏ hàng + lần bán chưa có kết quả được ghi xuống máy theo từng cửa hàng: app bị tắt không mất giỏ, và gửi lại
// lần bán đang treo vẫn dùng đúng mã chống trùng cũ → không sinh hoá đơn thứ hai.

const product = { productId: 'p1', code: 'K35', name: 'Kẹp tóc - K35', listPrice: 35_000, stock: 6 };
const variant = { productId: 'p2', variantId: 'c1', code: 'SC18-D', name: 'Scrunchies - Đen', listPrice: 18_000, stock: 3 };

const cart = () => useCart.getState();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const stored = async (scope: string) => {
  const raw = await AsyncStorage.getItem(cartKey(scope));
  return raw ? JSON.parse(raw) : null;
};

/** App bị tắt rồi mở lại: bộ nhớ trống, dữ liệu trên máy còn nguyên. */
const restart = () => useCart.setState({ lines: [], pending: null, scope: null, hydrated: false });

const draftOf = (lines: CartLine[], branchRefId = 'b1') => buildSaleDraft({ lines, payment: { method: 'Cash' }, branchRefId, soldByName: 'Lan' });

/** Máy chủ giả: ghi lại các gói đã nhận, trả lời theo kịch bản. */
function fakeServer(...replies: SaleHttpResult[]) {
  const received: SaleRequest[] = [];
  const timeouts: number[] = [];
  const send = async (request: SaleRequest, timeoutMs: number): Promise<SaleHttpResult> => {
    received.push(request);
    timeouts.push(timeoutMs);
    return replies[received.length - 1] ?? { status: null, data: null };
  };
  return { send, received, timeouts };
}

const NO_ANSWER: SaleHttpResult = { status: null, data: 'Something went wrong' };

beforeEach(async () => {
  await AsyncStorage.clear();
  restart();
});

describe('lưu giỏ hàng xuống máy', () => {
  it('mỗi lần sửa giỏ đều ghi; app bị tắt rồi mở lại vẫn còn nguyên giỏ', async () => {
    await cart().hydrate('shop1');
    cart().add(product);
    cart().add(product);
    cart().add(variant);
    cart().setPrice('c1', 15_000);
    await flush();

    restart();
    expect(cart().lines).toHaveLength(0);
    await cart().hydrate('shop1');
    expect(cart().lines).toEqual([
      { ...product, key: 'p1', qty: 2, price: 35_000 },
      { ...variant, key: 'c1', qty: 1, price: 15_000 },
    ]);
    expect(cartTotal(cart().lines)).toBe(85_000);
  });

  it('giỏ rỗng thì xoá bản lưu', async () => {
    await cart().hydrate('shop1');
    cart().add(product);
    await flush();
    expect(await stored('shop1')).not.toBeNull();
    cart().clear();
    await flush();
    expect(await stored('shop1')).toBeNull();
  });

  it('giỏ lưu theo từng cửa hàng — cửa hàng khác không thấy', async () => {
    await cart().hydrate('shop1');
    cart().add(product);
    await flush();

    await cart().hydrate('shop2');
    expect(cart()).toMatchObject({ scope: 'shop2', hydrated: true, lines: [] });
    cart().add(variant);
    await flush();

    await cart().hydrate('shop1');
    expect(cart().lines.map((l) => l.key)).toEqual(['p1']);
    expect((await stored('shop2')).lines.map((l: CartLine) => l.key)).toEqual(['c1']);
  });

  it('món thêm trước khi nạp xong (mở thẳng trang hàng hoá) được gộp vào giỏ đã lưu', async () => {
    await cart().hydrate('shop1');
    cart().add(product);
    await flush();

    restart();
    cart().add(product);
    cart().add(variant);
    await cart().hydrate('shop1');
    expect(cart().lines.map((l) => [l.key, l.qty])).toEqual([['p1', 2], ['c1', 1]]);
    await flush();
    expect((await stored('shop1')).lines).toHaveLength(2);
  });

  it('chưa nạp thì chưa ghi (không đè bản đã lưu bằng giỏ đang trống)', async () => {
    await AsyncStorage.setItem(cartKey('shop1'), serializeCart({ lines: [{ ...product, key: 'p1', qty: 4, price: 35_000 }], pending: null }, Date.now()));
    cart().add(variant);
    await flush();
    expect((await stored('shop1')).lines).toHaveLength(1);
  });

  it('đổi cửa hàng: quên giỏ của cửa hàng cũ', async () => {
    await cart().hydrate('shop1');
    cart().add(product);
    await flush();
    await cart().forget('shop1');
    expect(cart()).toMatchObject({ scope: null, hydrated: false, lines: [] });
    expect(await stored('shop1')).toBeNull();
  });
});

describe('đọc bản giỏ đã lưu', () => {
  const line: CartLine = { ...product, key: 'p1', qty: 2, price: 35_000 };
  const now = Date.parse('2026-10-06T03:00:00Z');

  it('hỏng / sai phiên bản / dòng sai dạng → bỏ, không ném lỗi', () => {
    const empty = { lines: [], pending: null };
    for (const raw of [null, undefined, '', '{hỏng', '[]', '{"v":2,"lines":[]}']) expect(parseSavedCart(raw, now)).toEqual(empty);
    const raw = JSON.stringify({ v: 1, savedAt: now, pending: null, lines: [line, { ...line, key: 'x', qty: 0 }, { key: 'y' }, null] });
    expect(parseSavedCart(raw, now).lines).toEqual([line]);
  });

  it('giỏ lưu quá 24 giờ thì bỏ (giá, tồn đã cũ)', () => {
    const raw = serializeCart({ lines: [line], pending: null }, now);
    expect(parseSavedCart(raw, now + CART_TTL_MS).lines).toHaveLength(1);
    expect(parseSavedCart(raw, now + CART_TTL_MS + 1).lines).toHaveLength(0);
  });

  it('lần bán chưa biết kết quả luôn được giữ, kể cả đã lâu; đang gửi dở coi như chưa biết kết quả', () => {
    const request = { ...draftOf([line]), clientRequestId: 'req-1' };
    const raw = serializeCart({ lines: [line], pending: { request, status: 'sending', startedAt: now } }, now);
    const saved = parseSavedCart(raw, now + 30 * CART_TTL_MS);
    expect(saved.lines).toEqual([line]);
    expect(saved.pending).toMatchObject({ status: 'unknown', request: { clientRequestId: 'req-1' } });
  });

  it('gộp dòng: cùng món cộng số lượng, món mới thêm cuối', () => {
    const merged = mergeLines([line], [{ ...line, qty: 3 }, { ...variant, key: 'c1', qty: 1, price: 18_000 }]);
    expect(merged.map((l) => [l.key, l.qty])).toEqual([['p1', 5], ['c1', 1]]);
    expect(line.qty).toBe(2); // không sửa mảng gốc
  });
});

describe('bán hàng: mã chống trùng qua các lần gửi', () => {
  beforeEach(async () => {
    await cart().hydrate('shop1');
    cart().add(product);
    cart().add(variant);
  });

  it('bán được: gửi kèm chi nhánh + mã chống trùng, hết giờ 15 giây; xong thì xoá giỏ và bản lưu', async () => {
    const server = fakeServer({ status: 200, data: { id: 'inv-1', kiotVietSyncStatus: 'NotPushed' } });
    const attempt = await sendSale(draftOf(cart().lines), server.send);

    expect(attempt).toEqual({ kind: 'created', sale: { id: 'inv-1', kiotVietSyncStatus: 'NotPushed' } });
    expect(server.timeouts).toEqual([15_000]);
    expect(server.received[0]).toMatchObject({ branchRefId: 'b1', totalPayment: 53_000 });
    expect(server.received[0]!.clientRequestId).toEqual(expect.any(String));
    expect(server.received[0]!.clientRequestId.length).toBeGreaterThan(0);
    expect(cart()).toMatchObject({ lines: [], pending: null });
    await flush();
    expect(await stored('shop1')).toBeNull();
  });

  it('mã được ghi xuống máy TRƯỚC khi gửi', async () => {
    let savedWhileSending: any = null;
    const send = async (): Promise<SaleHttpResult> => {
      savedWhileSending = await stored('shop1');
      return { status: 200, data: { id: 'inv-1' } };
    };
    await sendSale(draftOf(cart().lines), send);
    expect(savedWhileSending.pending).toMatchObject({ status: 'sending' });
    expect(savedWhileSending.pending.request.clientRequestId).toEqual(expect.any(String));
    expect(savedWhileSending.lines).toHaveLength(2);
  });

  it('hết giờ / mất mạng: giỏ khoá, "kiểm tra lại" gửi đúng gói cũ với đúng mã cũ cho tới khi có hoá đơn', async () => {
    const server = fakeServer(NO_ANSWER, NO_ANSWER, { status: 200, data: { id: 'inv-1' } });

    expect(await sendSale(draftOf(cart().lines), server.send)).toEqual({ kind: 'unknown' });
    expect(cart().pending?.status).toBe('unknown');

    // Giỏ khoá: không thêm, không sửa, không xoá được.
    expect(cart().add(product)).toBe(false);
    cart().setQty('p1', 9);
    cart().clear();
    expect(cart().lines.map((l) => [l.key, l.qty])).toEqual([['p1', 1], ['c1', 1]]);

    expect((await sendSale('recheck', server.send)).kind).toBe('unknown');
    expect((await sendSale('recheck', server.send)).kind).toBe('created');

    const [first, second, third] = server.received;
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(cart()).toMatchObject({ lines: [], pending: null });
  });

  it('đang treo mà lỡ bấm bán lần nữa với giỏ khác → vẫn gửi gói đang treo, không mở lần bán thứ hai', async () => {
    const server = fakeServer(NO_ANSWER, { status: 200, data: { id: 'inv-1' } });
    await sendSale(draftOf(cart().lines), server.send);
    await sendSale(draftOf([{ ...product, key: 'p1', qty: 7, price: 35_000 }]), server.send);
    expect(server.received[1]).toEqual(server.received[0]);
  });

  it('app bị tắt lúc đang gửi: mở lại thấy lần bán chờ kiểm tra, gửi lại vẫn đúng mã cũ → một hoá đơn', async () => {
    let firstId = '';
    // Lần gửi đầu không bao giờ trả lời (app bị tắt giữa chừng).
    const hanging = (request: SaleRequest) => {
      firstId = request.clientRequestId;
      return new Promise<SaleHttpResult>(() => {});
    };
    void sendSale(draftOf(cart().lines), hanging);
    await flush();
    await flush();
    expect(firstId).not.toBe('');

    restart();
    await cart().hydrate('shop1');
    expect(cart().pending).toMatchObject({ status: 'unknown', request: { clientRequestId: firstId } });
    expect(cart().lines).toHaveLength(2);
    expect(cart().add(product)).toBe(false);

    const server = fakeServer({ status: 200, data: { id: 'inv-1' } });
    expect((await sendSale('recheck', server.send)).kind).toBe('created');
    expect(server.received[0]!.clientRequestId).toBe(firstId);
    await flush();
    expect(await stored('shop1')).toBeNull();
  });

  it('máy chủ từ chối (4xx): giỏ mở lại; bán lại đúng nội dung giữ mã cũ, sửa giỏ thì mã mới', async () => {
    const problem = { title: 'Không đủ tồn kho' };
    const server = fakeServer({ status: 400, data: problem }, { status: 400, data: problem }, { status: 200, data: { id: 'inv-1' } });

    expect(await sendSale(draftOf(cart().lines), server.send)).toEqual({ kind: 'rejected', error: problem });
    expect(cart().pending?.status).toBe('rejected');
    expect(cart().lines).toHaveLength(2);

    await sendSale(draftOf(cart().lines), server.send);
    expect(server.received[1]!.clientRequestId).toBe(server.received[0]!.clientRequestId);

    expect(cart().add(product)).toBe(true);
    await sendSale(draftOf(cart().lines), server.send);
    expect(server.received[2]!.clientRequestId).not.toBe(server.received[0]!.clientRequestId);
    expect(cart().lines).toHaveLength(0);
  });

  it('bán xong rồi bán đơn mới y hệt → mã mới (không dính hoá đơn trước)', async () => {
    const server = fakeServer({ status: 200, data: { id: 'inv-1' } }, { status: 200, data: { id: 'inv-2' } });
    await sendSale(draftOf(cart().lines), server.send);
    cart().add(product);
    cart().add(variant);
    await sendSale(draftOf(cart().lines), server.send);
    expect(server.received[1]!.clientRequestId).not.toBe(server.received[0]!.clientRequestId);
  });

  it('bỏ kiểm tra: thôi theo dõi lần bán treo, giỏ giữ nguyên và sửa lại được', async () => {
    const server = fakeServer(NO_ANSWER);
    await sendSale(draftOf(cart().lines), server.send);
    cart().dropPendingSale();
    expect(cart().pending).toBeNull();
    expect(cart().lines).toHaveLength(2);
    expect(cart().add(product)).toBe(true);
    await flush();
    expect((await stored('shop1')).pending).toBeNull();
  });

  it('không còn lần bán treo thì "kiểm tra lại" không gửi gì', async () => {
    const server = fakeServer();
    expect((await sendSale('recheck', server.send)).kind).toBe('rejected');
    expect(server.received).toHaveLength(0);
  });

  it('đổi cửa hàng khi còn lần bán chưa biết kết quả: giữ bản lưu để quay lại kiểm tra; kết quả về trễ không đụng giỏ cửa hàng khác', async () => {
    let answer: (r: SaleHttpResult) => void = () => {};
    const slow = () => new Promise<SaleHttpResult>((resolve) => (answer = resolve));
    const inFlight = sendSale(draftOf(cart().lines), slow);
    await flush();
    await flush();

    await cart().forget('shop1');
    await cart().hydrate('shop2');
    cart().add(product);
    answer({ status: 200, data: { id: 'inv-1' } });
    await inFlight;
    expect(cart()).toMatchObject({ scope: 'shop2', pending: null });
    expect(cart().lines).toHaveLength(1);

    await cart().hydrate('shop1');
    expect(cart().pending?.status).toBe('unknown');
    expect(cart().lines).toHaveLength(2);
  });
});

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { IBranchLocation } from 'src/types/corecms-api';

import {
  activeBranches,
  branchKey,
  branchTypeOf,
  parseStoredBranch,
  reconcileBranches,
  useWorkingBranch,
} from '../working-branch';

// Chi nhánh đang làm việc của máy: lưu theo từng cửa hàng, tự chọn khi cửa hàng chỉ có một chi nhánh, hỏi khi có
// nhiều, hỏi lại khi chi nhánh đã chọn không còn, quên khi đổi cửa hàng.

const api = (id: string, over: Partial<IBranchLocation> = {}): IBranchLocation => ({
  id,
  branchName: `Chi nhánh ${id}`,
  geofenceRadius: 100,
  isActive: true,
  createdDate: '2026-01-01T00:00:00Z',
  ...over,
});

const store = () => useWorkingBranch.getState();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const saved = async (scope: string) => parseStoredBranch(await AsyncStorage.getItem(branchKey(scope)));

/** Mở app lại: bộ nhớ trống, dữ liệu trên máy còn nguyên. */
const restart = () => useWorkingBranch.setState({ scope: null, hydrated: false, branch: null, options: null, needsPick: null });

beforeEach(async () => {
  await AsyncStorage.clear();
  restart();
});

describe('đọc danh sách chi nhánh', () => {
  it('loại hình: chỉ "fnb" (không phân biệt hoa thường) là F&B; thiếu / lạ → retail', () => {
    expect(branchTypeOf('fnb')).toBe('fnb');
    expect(branchTypeOf(' FnB ')).toBe('fnb');
    expect(branchTypeOf('retail')).toBe('retail');
    for (const v of [undefined, null, '', 'cafe', 3, {}]) expect(branchTypeOf(v)).toBe('retail');
  });

  it('chỉ lấy chi nhánh đang hoạt động, giữ thứ tự API; core-be cũ không trả businessType → retail', () => {
    const list = [api('b1'), api('b2', { isActive: false }), api('b3', { businessType: 'fnb' })];
    expect(activeBranches(list)).toEqual([
      { id: 'b1', name: 'Chi nhánh b1', type: 'retail' },
      { id: 'b3', name: 'Chi nhánh b3', type: 'fnb' },
    ]);
    expect(activeBranches(null)).toEqual([]);
    expect(activeBranches({ items: [] } as any)).toEqual([]);
  });
});

describe('đối chiếu với GET /branches', () => {
  it('cửa hàng có đúng một chi nhánh → tự chọn', () => {
    expect(reconcileBranches(null, [api('b1')])).toMatchObject({ branch: { id: 'b1', type: 'retail' }, needsPick: null });
  });

  it('nhiều chi nhánh, chưa chọn → cần chọn lần đầu', () => {
    const next = reconcileBranches(null, [api('b1'), api('b2')]);
    expect(next.branch).toBeNull();
    expect(next.needsPick).toBe('first');
    expect(next.options.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('chi nhánh đã chọn vẫn còn → giữ, lấy tên và loại hình mới nhất', () => {
    const stored = { id: 'b2', name: 'Tên cũ', type: 'retail' as const };
    const next = reconcileBranches(stored, [api('b1'), api('b2', { branchName: 'Quầy cà phê', businessType: 'fnb' })]);
    expect(next).toMatchObject({ branch: { id: 'b2', name: 'Quầy cà phê', type: 'fnb' }, needsPick: null });
  });

  it('chi nhánh đã chọn bị ngừng / xoá → chọn lại; chỉ còn một chi nhánh thì tự chuyển sang chi nhánh đó', () => {
    const stored = { id: 'b2', name: 'Chi nhánh b2', type: 'retail' as const };
    expect(reconcileBranches(stored, [api('b1'), api('b2', { isActive: false }), api('b3')])).toMatchObject({ branch: null, needsPick: 'gone' });
    expect(reconcileBranches(stored, [api('b1')])).toMatchObject({ branch: { id: 'b1' }, needsPick: null });
  });

  it('không có chi nhánh nào đang hoạt động → không có chi nhánh, không hỏi', () => {
    expect(reconcileBranches({ id: 'b1', name: 'x', type: 'retail' }, [])).toEqual({ branch: null, options: [], needsPick: null });
  });
});

describe('store chi nhánh đang làm việc', () => {
  it('một chi nhánh: tự chọn và ghi xuống máy theo mã cửa hàng', async () => {
    await store().hydrate('shop1');
    expect(store()).toMatchObject({ hydrated: true, scope: 'shop1', branch: null, options: null });

    store().reconcile([api('b1')]);
    await flush();
    expect(store().branch).toEqual({ id: 'b1', name: 'Chi nhánh b1', type: 'retail' });
    expect(await saved('shop1')).toEqual({ id: 'b1', name: 'Chi nhánh b1', type: 'retail' });
  });

  it('nhiều chi nhánh: chờ người dùng chọn; chọn xong thì nhớ, mở app lại có ngay trước khi hỏi mạng', async () => {
    await store().hydrate('shop1');
    store().reconcile([api('b1'), api('b2', { businessType: 'fnb' })]);
    expect(store()).toMatchObject({ branch: null, needsPick: 'first' });
    expect(await saved('shop1')).toBeNull();

    store().select('khong-co'); // id lạ → bỏ qua
    expect(store().branch).toBeNull();

    store().select('b2');
    await flush();
    expect(store()).toMatchObject({ branch: { id: 'b2', type: 'fnb' }, needsPick: null });

    restart();
    await store().hydrate('shop1');
    expect(store().branch).toEqual({ id: 'b2', name: 'Chi nhánh b2', type: 'fnb' });
    expect(store().options).toBeNull(); // chưa hỏi lại GET /branches
  });

  it('chi nhánh đã lưu không còn → bỏ chọn, xoá bản lưu và hỏi lại', async () => {
    await AsyncStorage.setItem(branchKey('shop1'), JSON.stringify({ id: 'b9', name: 'Đã đóng', type: 'retail' }));
    await store().hydrate('shop1');
    expect(store().branch?.id).toBe('b9');

    store().reconcile([api('b1'), api('b2')]);
    await flush();
    expect(store()).toMatchObject({ branch: null, needsPick: 'gone' });
    expect(await saved('shop1')).toBeNull();
  });

  it('chưa nạp xong thì chưa đối chiếu (không ghi đè chi nhánh đã lưu bằng kết quả tự chọn)', async () => {
    store().reconcile([api('b1')]);
    expect(store().branch).toBeNull();
    expect(await saved('shop1')).toBeNull();
  });

  it('mỗi cửa hàng một chi nhánh riêng; đổi cửa hàng thì quên chi nhánh của cửa hàng cũ', async () => {
    await store().hydrate('shop1');
    store().reconcile([api('b1')]);
    await flush();

    // Sang cửa hàng khác (setStore gọi clear với mã cửa hàng cũ).
    await store().clear('shop1');
    expect(store()).toMatchObject({ scope: null, hydrated: false, branch: null });
    expect(await saved('shop1')).toBeNull();

    await store().hydrate('shop2');
    expect(store()).toMatchObject({ scope: 'shop2', branch: null });
    store().reconcile([api('x1'), api('x2')]);
    store().select('x2');
    await flush();
    expect(await saved('shop2')).toMatchObject({ id: 'x2' });
    expect(await saved('shop1')).toBeNull();
  });

  it('bản lưu hỏng → coi như chưa chọn', async () => {
    await AsyncStorage.setItem(branchKey('shop1'), '{hỏng');
    await store().hydrate('shop1');
    expect(store()).toMatchObject({ hydrated: true, branch: null });
    expect(parseStoredBranch('{"name":"thiếu id"}')).toBeNull();
    expect(parseStoredBranch('{"id":"b1"}')).toEqual({ id: 'b1', name: '', type: 'retail' });
  });
});

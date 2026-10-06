import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ----------------------------------------------------------------------
// Dữ liệu theo cửa hàng trên máy (chi nhánh đang làm việc + giỏ hàng): nạp xong mới dựng thanh tab; đối chiếu chi
// nhánh với GET /branches; đổi cửa hàng thì quên dữ liệu của cửa hàng cũ.
// ----------------------------------------------------------------------

const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockSecure.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockSecure.delete(k);
  }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { name: 'Spark Store', extra: { appVariant: 'store' } } },
}));

jest.mock('src/api/attendance', () => ({ getBranchLocations: jest.fn() }));

import { getBranchLocations } from 'src/api/attendance';
import { cartKey, useCart } from 'src/features/pos/cart-store';
import { buildSaleDraft } from 'src/features/pos/sale-request';
import { sendSale } from 'src/features/pos/checkout';
import { setStore } from 'src/services/store-config';
import type { IBranchLocation } from 'src/types/corecms-api';

import { StoreScopeGate } from '../StoreScopeGate';
import { currentStoreScope, hydrateStoreScope } from '../store-scope';
import { branchKey, useWorkingBranch } from '../working-branch';

const mockedBranches = getBranchLocations as jest.MockedFunction<typeof getBranchLocations>;

const profile = (code: string) => ({
  code,
  host: `${code}.store.devbyspark.com`,
  name: code,
  logoUrl: null,
  primaryColor: null,
  locale: null,
  currency: null,
  timezone: null,
});

const branch = (id: string, over: Partial<IBranchLocation> = {}): IBranchLocation => ({
  id,
  branchName: `Chi nhánh ${id}`,
  geofenceRadius: 100,
  isActive: true,
  createdDate: '2026-01-01T00:00:00Z',
  ...over,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const product = { productId: 'p1', code: 'K35', name: 'Kẹp tóc', listPrice: 35_000, stock: 6 };

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <StoreScopeGate>
        <Text>thanh tab</Text>
      </StoreScopeGate>
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  mockSecure.clear();
  await AsyncStorage.clear();
  useCart.setState({ lines: [], pending: null, scope: null, hydrated: false });
  useWorkingBranch.setState({ scope: null, hydrated: false, branch: null, options: null, needsPick: null });
  mockedBranches.mockReset().mockResolvedValue([branch('b1')]);
  await setStore(profile('shop1'));
});

describe('cổng nạp dữ liệu theo cửa hàng', () => {
  it('khoá phân vùng là mã cửa hàng đang gắn', () => {
    expect(currentStoreScope()).toBe('shop1');
  });

  it('chưa nạp xong thì chưa dựng thanh tab; nạp xong có ngay chi nhánh đã lưu + giỏ đã lưu, chưa cần mạng', async () => {
    await AsyncStorage.setItem(branchKey('shop1'), JSON.stringify({ id: 'b2', name: 'Cầu Giấy', type: 'retail' }));
    // GET /branches chưa trả lời.
    mockedBranches.mockReturnValue(new Promise(() => {}));

    renderGate();
    expect(screen.queryByText('thanh tab')).toBeNull();

    expect(await screen.findByText('thanh tab')).toBeTruthy();
    expect(useWorkingBranch.getState()).toMatchObject({ scope: 'shop1', hydrated: true, branch: { id: 'b2', name: 'Cầu Giấy' }, options: null });
    expect(useCart.getState()).toMatchObject({ scope: 'shop1', hydrated: true });
  });

  it('cửa hàng một chi nhánh: hỏi GET /branches rồi tự chọn, không cần người dùng làm gì', async () => {
    renderGate();
    await screen.findByText('thanh tab');
    await waitFor(() => expect(useWorkingBranch.getState().branch).toEqual({ id: 'b1', name: 'Chi nhánh b1', type: 'retail' }));
    expect(useWorkingBranch.getState().needsPick).toBeNull();
    expect(mockedBranches).toHaveBeenCalledTimes(1);
  });

  it('nhiều chi nhánh: đánh dấu cần chọn (màn Bán hàng mở bảng chọn), không tự chọn bừa', async () => {
    mockedBranches.mockResolvedValue([branch('b1'), branch('b2', { businessType: 'fnb' }), branch('b3', { isActive: false })]);
    renderGate();
    await screen.findByText('thanh tab');
    await waitFor(() => expect(useWorkingBranch.getState().needsPick).toBe('first'));
    expect(useWorkingBranch.getState().branch).toBeNull();
    expect(useWorkingBranch.getState().options?.map((b) => [b.id, b.type])).toEqual([['b1', 'retail'], ['b2', 'fnb']]);
  });

  it('không hỏi được GET /branches (mất mạng): vẫn vào app với chi nhánh đã lưu', async () => {
    await AsyncStorage.setItem(branchKey('shop1'), JSON.stringify({ id: 'b2', name: 'Cầu Giấy', type: 'retail' }));
    mockedBranches.mockRejectedValue('Something went wrong');
    renderGate();
    await screen.findByText('thanh tab');
    await waitFor(() => expect(mockedBranches).toHaveBeenCalled());
    await act(flush);
    expect(useWorkingBranch.getState()).toMatchObject({ branch: { id: 'b2' }, options: null, needsPick: null });
  });
});

describe('đổi cửa hàng', () => {
  it('quên chi nhánh đang làm việc và giỏ hàng của cửa hàng cũ; cửa hàng mới bắt đầu trống', async () => {
    await hydrateStoreScope(currentStoreScope());
    useWorkingBranch.getState().reconcile([branch('b1')]);
    useCart.getState().add(product);
    await flush();
    expect(await AsyncStorage.getItem(branchKey('shop1'))).not.toBeNull();
    expect(await AsyncStorage.getItem(cartKey('shop1'))).not.toBeNull();

    await setStore(profile('shop2'));

    expect(await AsyncStorage.getItem(branchKey('shop1'))).toBeNull();
    expect(await AsyncStorage.getItem(cartKey('shop1'))).toBeNull();
    expect(useWorkingBranch.getState()).toMatchObject({ hydrated: false, branch: null });
    expect(useCart.getState()).toMatchObject({ hydrated: false, lines: [] });

    expect(currentStoreScope()).toBe('shop2');
    await hydrateStoreScope(currentStoreScope());
    expect(useWorkingBranch.getState()).toMatchObject({ scope: 'shop2', hydrated: true, branch: null });
    expect(useCart.getState()).toMatchObject({ scope: 'shop2', hydrated: true, lines: [] });
  });

  it('còn lần bán chưa biết kết quả thì giữ bản lưu của cửa hàng cũ để quay lại kiểm tra', async () => {
    await hydrateStoreScope(currentStoreScope());
    useCart.getState().add(product);
    await sendSale(buildSaleDraft({ lines: useCart.getState().lines, payment: { method: 'Cash' } }), async () => ({ status: null, data: null }));
    expect(useCart.getState().pending?.status).toBe('unknown');

    await setStore(profile('shop2'));
    expect(await AsyncStorage.getItem(cartKey('shop1'))).not.toBeNull();

    await setStore(profile('shop1'));
    await hydrateStoreScope(currentStoreScope());
    expect(useCart.getState().pending?.status).toBe('unknown');
    expect(useCart.getState().lines).toHaveLength(1);
  });

  it('vào lại đúng cửa hàng đang gắn (đăng nhập lại) không xoá gì', async () => {
    await hydrateStoreScope(currentStoreScope());
    useWorkingBranch.getState().reconcile([branch('b1')]);
    useCart.getState().add(product);
    await flush();

    await setStore(profile('shop1'));
    expect(await AsyncStorage.getItem(branchKey('shop1'))).not.toBeNull();
    expect(useCart.getState().lines).toHaveLength(1);
  });
});

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { getBankAccounts, getCategories, getProducts, getWarehouses, submitSale } from 'src/api/erp';
import { confirm, toast } from 'src/components/overlay';
import { useLocaleStore } from 'src/i18n';
import { useWorkingBranch } from 'src/features/branch/working-branch';
import type { IBranchLocation } from 'src/types/corecms-api';

import { useCart } from '../cart-store';
import { PosScreen } from '../PosScreen';

// Màn Bán hàng sau khi tách khung: điện thoại vẫn một cột + bảng trượt như trước; tablet xoay ngang chia hai
// khung. Bán kèm chi nhánh đang làm việc + mã chống trùng; hết giờ thì "Đang kiểm tra hoá đơn" gửi lại đúng mã.

let mockResponsive = { width: 390, height: 844, isTablet: false, isLandscape: false };
let mockUser: any = null;

jest.mock('src/hooks/use-responsive', () => ({
  TABLET_BREAKPOINT: 600,
  useResponsive: () => mockResponsive,
}));
jest.mock('src/auth/auth-context', () => ({ useAuthContext: () => ({ user: mockUser }) }));
jest.mock('expo-router', () => {
  // eslint-disable-next-line global-require
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => false },
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: false, canAskAgain: false }, jest.fn()] }));
jest.mock('src/components/overlay', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
  confirm: jest.fn(),
}));
jest.mock('src/api/erp', () => ({
  getProducts: jest.fn(),
  getWarehouses: jest.fn(),
  getCategories: jest.fn(),
  getBankAccounts: jest.fn(),
  submitSale: jest.fn(),
}));

const mockedProducts = getProducts as jest.MockedFunction<typeof getProducts>;
const mockedWarehouses = getWarehouses as jest.MockedFunction<typeof getWarehouses>;
const mockedCategories = getCategories as jest.MockedFunction<typeof getCategories>;
const mockedBanks = getBankAccounts as jest.MockedFunction<typeof getBankAccounts>;
const mockedSubmit = submitSale as jest.MockedFunction<typeof submitSale>;
const mockedConfirm = confirm as jest.MockedFunction<typeof confirm>;

const product = (id: string, name: string, basePrice: number) =>
  ({ id, code: id.toUpperCase(), name, categoryName: 'Kẹp tóc', hasVariants: false, basePrice, productType: 2, isActive: true, minQuantity: 0, maxQuantity: 0, inventories: [{ onHand: 5 }] }) as any;

const branch = (id: string, name: string): IBranchLocation => ({ id, branchName: name, geofenceRadius: 100, isActive: true, createdDate: '2026-01-01T00:00:00Z' });

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const tree = () => (
    <QueryClientProvider client={client}>
      <PosScreen />
    </QueryClientProvider>
  );
  const view = render(tree());
  /** Xoay máy / đổi cỡ cửa sổ: vẽ lại với kích thước mới. */
  const resize = (next: typeof mockResponsive) => {
    mockResponsive = next;
    view.rerender(tree());
  };
  return { ...view, resize };
}

/** Vào bước thanh toán từ bảng giỏ hàng (hoặc khung giỏ bên phải) rồi chờ PaymentPanel nạp xong tài khoản ngân hàng. */
async function goToPayment(label: string) {
  fireEvent.press(await screen.findByText(label));
  await screen.findByText('Hoàn tất bán');
  await waitFor(() => expect(mockedBanks).toHaveBeenCalled());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function setBranches(list: IBranchLocation[]) {
  await useWorkingBranch.getState().hydrate('shop1');
  useWorkingBranch.getState().reconcile(list);
}

beforeEach(async () => {
  await useLocaleStore.getState().setPreference('vi');
  await AsyncStorage.clear();
  useCart.setState({ lines: [], pending: null, scope: null, hydrated: false });
  useWorkingBranch.setState({ scope: null, hydrated: false, branch: null, options: null, needsPick: null });
  await useCart.getState().hydrate('shop1');
  mockResponsive = { width: 390, height: 844, isTablet: false, isLandscape: false };
  mockUser = { id: 'u1', email: 'lan@shop.vn', firstName: 'Lan', lastName: 'Trần', role: 'Staff', roles: ['Staff'], permissions: [] };
  mockedProducts.mockReset().mockResolvedValue({ items: [product('p1', 'Kẹp tóc nơ', 35_000), product('p2', 'Dây buộc tóc', 12_000)], totalCount: 2 });
  mockedWarehouses.mockReset().mockResolvedValue([{ id: 'w1', name: 'Kho chính', isDefault: true, isActive: true }]);
  mockedCategories.mockReset().mockResolvedValue([
    { id: 'c1', name: 'Kẹp tóc', isActive: true },
    { id: 'c2', name: 'Dây buộc', isActive: true },
  ]);
  mockedBanks.mockReset().mockResolvedValue([]);
  mockedSubmit.mockReset();
  mockedConfirm.mockReset().mockResolvedValue(true);
  (toast.info as jest.Mock).mockClear();
  (toast.error as jest.Mock).mockClear();
});

describe('điện thoại: một cột + bảng trượt như trước', () => {
  it('cửa hàng một chi nhánh: hiện tên chi nhánh ở đầu trang, bán kèm chi nhánh + mã chống trùng, hết giờ 15 giây', async () => {
    await setBranches([branch('b1', 'Chùa Láng')]);
    mockedSubmit.mockResolvedValue({ status: 200, data: { id: 'inv-1', kiotVietSyncStatus: 'NotPushed' } });
    renderScreen();

    expect(await screen.findByText('Lan Trần · Chùa Láng')).toBeTruthy();
    // Chưa có gì trong giỏ: không có thanh giỏ nổi, giỏ không nằm sẵn trên màn (chỉ mở bằng bảng trượt).
    expect(screen.queryByText(/^Giỏ hàng ·/)).toBeNull();
    expect(screen.queryByText('Chọn hàng ở danh sách hoặc quét mã để bán')).toBeNull();

    fireEvent.press(await screen.findByText('Kẹp tóc nơ'));
    fireEvent.press(screen.getByText('Kẹp tóc nơ'));
    expect(useCart.getState().lines).toMatchObject([{ key: 'p1', qty: 2 }]);

    // Thanh giỏ nổi → bảng giỏ hàng → thanh toán → hoàn tất.
    expect(screen.getByText('70.000đ')).toBeTruthy();
    fireEvent.press(screen.getByText('Thanh toán'));
    expect(await screen.findByText('Giỏ hàng · 2 món')).toBeTruthy();
    await goToPayment('Thanh toán · 70.000đ');
    fireEvent.press(await screen.findByText('Hoàn tất bán'));

    expect(await screen.findByText('Đã bán xong')).toBeTruthy();
    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    const [request, timeoutMs] = mockedSubmit.mock.calls[0]!;
    expect(timeoutMs).toBe(15_000);
    expect(request).toMatchObject({
      totalPayment: 70_000,
      method: 'Cash',
      warehouseId: 'w1',
      branchRefId: 'b1',
      soldByName: 'Trần Lan',
      invoiceDetails: [{ productId: 'p1', productCode: 'P1', productName: 'Kẹp tóc nơ', quantity: 2, price: 35_000 }],
      payments: [{ method: 'Cash', amount: 70_000 }],
    });
    expect(request.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(useCart.getState()).toMatchObject({ lines: [], pending: null });
    // Hoá đơn chỉ lưu trong hệ thống: không nhắc KiotViet.
    expect(screen.queryByText('Hoá đơn đang được đẩy sang KiotViet.')).toBeNull();
  });

  it('hết giờ / mất mạng: hiện "Đang kiểm tra hoá đơn", giỏ khoá; Kiểm tra lại gửi đúng gói cũ rồi ra hoá đơn', async () => {
    await setBranches([branch('b1', 'Chùa Láng')]);
    mockedSubmit.mockResolvedValueOnce({ status: null, data: 'Something went wrong' }).mockResolvedValueOnce({ status: 200, data: { id: 'inv-1' } });
    renderScreen();

    fireEvent.press(await screen.findByText('Kẹp tóc nơ'));
    fireEvent.press(screen.getByText('Thanh toán'));
    await goToPayment('Thanh toán · 35.000đ');
    fireEvent.press(await screen.findByText('Hoàn tất bán'));

    expect((await screen.findAllByText('Đang kiểm tra hoá đơn')).length).toBeGreaterThan(0);
    expect(useCart.getState().pending?.status).toBe('unknown');
    // Giỏ khoá: bấm thêm hàng không đổi giỏ, có báo lý do.
    fireEvent.press(screen.getByText('Dây buộc tóc'));
    expect(useCart.getState().lines).toMatchObject([{ key: 'p1', qty: 1 }]);
    expect(toast.info).toHaveBeenCalledWith('Lần bán trước chưa xong — chưa sửa giỏ được.');

    fireEvent.press(screen.getAllByText('Kiểm tra lại').pop()!);
    expect(await screen.findByText('Đã bán xong')).toBeTruthy();
    expect(mockedSubmit).toHaveBeenCalledTimes(2);
    expect(mockedSubmit.mock.calls[1]![0]).toEqual(mockedSubmit.mock.calls[0]![0]);
    expect(useCart.getState()).toMatchObject({ lines: [], pending: null });
  });

  it('máy chủ từ chối (4xx): giỏ còn nguyên để sửa, không vào chế độ kiểm tra', async () => {
    await setBranches([branch('b1', 'Chùa Láng')]);
    mockedSubmit.mockResolvedValue({ status: 400, data: { title: 'Giá bán không đúng giá niêm yết' } });
    renderScreen();

    fireEvent.press(await screen.findByText('Kẹp tóc nơ'));
    act(() => {
      useCart.getState().add({ productId: 'p2', code: 'P2', name: 'Dây buộc tóc', listPrice: 12_000, stock: 5 });
    });
    fireEvent.press(screen.getByText('Thanh toán'));
    await goToPayment('Thanh toán · 47.000đ');
    fireEvent.press(await screen.findByText('Hoàn tất bán'));

    await waitFor(() => expect(useCart.getState().pending?.status).toBe('rejected'));
    expect(toast.error).toHaveBeenCalledWith('Giá bán không đúng giá niêm yết', 'Chưa tạo được hoá đơn');
    expect(useCart.getState().lines).toHaveLength(2);
    expect(screen.queryByText('Đang kiểm tra hoá đơn')).toBeNull();
    expect(screen.queryByText('Đã bán xong')).toBeNull();
  });

  it('lọc theo nhóm hàng: bấm chip thì hỏi core-be đúng nhóm đó; "Tất cả" bỏ lọc', async () => {
    await setBranches([branch('b1', 'Chùa Láng')]);
    const all = [product('p1', 'Kẹp tóc nơ', 35_000), product('p2', 'Dây buộc tóc', 12_000)];
    mockedProducts.mockImplementation(async ({ categoryId }) =>
      categoryId === 'c2' ? { items: [all[1]], totalCount: 1 } : { items: all, totalCount: 2 }
    );
    renderScreen();

    await screen.findByText('Kẹp tóc nơ');
    expect(mockedProducts).toHaveBeenLastCalledWith({ keyword: '', categoryId: undefined, page: 1, pageSize: 30 });

    fireEvent.press(await screen.findByText('Dây buộc'));
    await waitFor(() => expect(screen.queryByText('Kẹp tóc nơ')).toBeNull());
    expect(await screen.findByText('Dây buộc tóc')).toBeTruthy();
    expect(mockedProducts).toHaveBeenLastCalledWith({ keyword: '', categoryId: 'c2', page: 1, pageSize: 30 });

    fireEvent.press(screen.getByText('Tất cả'));
    expect(await screen.findByText('Kẹp tóc nơ')).toBeTruthy();
  });

  it('cửa hàng chỉ có một nhóm hàng (hoặc không tải được nhóm) thì không có hàng chip', async () => {
    await setBranches([branch('b1', 'Chùa Láng')]);
    mockedCategories.mockResolvedValue([{ id: 'c1', name: 'Kẹp tóc', isActive: true }]);
    renderScreen();
    await screen.findByText('Kẹp tóc nơ');
    expect(screen.queryByText('Tất cả')).toBeNull();
  });

  it('cửa hàng nhiều chi nhánh, máy chưa chọn: mở bảng chọn; chọn xong tên chi nhánh lên đầu trang và đơn bán mang chi nhánh đó', async () => {
    await setBranches([branch('b1', 'Chùa Láng'), branch('b2', 'Cầu Giấy')]);
    mockedSubmit.mockResolvedValue({ status: 200, data: { id: 'inv-1' } });
    renderScreen();

    expect(await screen.findByText('Chọn chi nhánh làm việc')).toBeTruthy();
    fireEvent.press(screen.getByText('Cầu Giấy'));
    expect(await screen.findByText('Lan Trần · Cầu Giấy')).toBeTruthy();
    expect(screen.queryByText('Chọn chi nhánh làm việc')).toBeNull();

    fireEvent.press(await screen.findByText('Kẹp tóc nơ'));
    fireEvent.press(screen.getByText('Thanh toán'));
    await goToPayment('Thanh toán · 35.000đ');
    fireEvent.press(await screen.findByText('Hoàn tất bán'));
    await screen.findByText('Đã bán xong');
    expect(mockedSubmit.mock.calls[0]![0]).toMatchObject({ branchRefId: 'b2' });
  });

  it('nhiều chi nhánh mà đóng bảng không chọn: bấm Thanh toán phải chọn chi nhánh trước rồi mới vào thanh toán', async () => {
    await setBranches([branch('b1', 'Chùa Láng'), branch('b2', 'Cầu Giấy')]);
    renderScreen();
    await screen.findByText('Chọn chi nhánh làm việc');
    act(() => {
      useCart.getState().add({ productId: 'p1', code: 'P1', name: 'Kẹp tóc nơ', listPrice: 35_000, stock: 5 });
    });
    // Người dùng đóng bảng chọn mà không chọn.
    fireEvent(screen.getByText('Chọn chi nhánh làm việc'), 'requestClose');
    await waitFor(() => expect(screen.queryByText('Cầu Giấy')).toBeNull());

    fireEvent.press(screen.getByText('Thanh toán'));
    fireEvent.press(await screen.findByText('Thanh toán · 35.000đ'));
    // Chưa vào thanh toán: bảng chọn chi nhánh mở trước.
    expect(screen.queryByText('Hoàn tất bán')).toBeNull();
    fireEvent.press(await screen.findByText('Chùa Láng'));
    expect(await screen.findByText('Hoàn tất bán')).toBeTruthy();
    expect(useWorkingBranch.getState().branch?.id).toBe('b1');
    await waitFor(() => expect(mockedBanks).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });
});

describe('tablet xoay ngang: hai khung', () => {
  beforeEach(() => {
    mockResponsive = { width: 1180, height: 820, isTablet: true, isLandscape: true };
  });

  it('hàng bên trái, giỏ + thanh toán nằm sẵn bên phải (không cần mở bảng trượt)', async () => {
    await setBranches([branch('b1', 'Chùa Láng')]);
    mockedSubmit.mockResolvedValue({ status: 200, data: { id: 'inv-1' } });
    renderScreen();

    expect(await screen.findByText('Kẹp tóc nơ')).toBeTruthy();
    expect(screen.getByText('Giỏ hàng · 0 món')).toBeTruthy();
    expect(screen.getByText('Chọn hàng ở danh sách hoặc quét mã để bán')).toBeTruthy();

    fireEvent.press(screen.getByText('Dây buộc tóc'));
    expect(await screen.findByText('Giỏ hàng · 1 món')).toBeTruthy();
    await goToPayment('Thanh toán · 12.000đ');
    fireEvent.press(await screen.findByText('Hoàn tất bán'));

    expect(await screen.findByText('Đã bán xong')).toBeTruthy();
    expect(mockedSubmit.mock.calls[0]![0]).toMatchObject({ branchRefId: 'b1', totalPayment: 12_000 });
    expect(screen.getByText('Giỏ hàng · 0 món')).toBeTruthy();
  });

  it('xoay máy giữa chừng: giỏ và nhóm đang lọc giữ nguyên, chỉ đổi bố cục', async () => {
    await setBranches([branch('b1', 'Chùa Láng')]);
    const all = [product('p1', 'Kẹp tóc nơ', 35_000), product('p2', 'Dây buộc tóc', 12_000)];
    mockedProducts.mockImplementation(async ({ categoryId }) =>
      categoryId === 'c2' ? { items: [all[1]], totalCount: 1 } : { items: all, totalCount: 2 }
    );
    mockResponsive = { width: 820, height: 1180, isTablet: true, isLandscape: false };
    const view = renderScreen();

    // Tablet cầm dọc = bố cục một cột: giỏ không nằm sẵn trên màn.
    await screen.findByText('Kẹp tóc nơ');
    expect(screen.queryByText(/^Giỏ hàng ·/)).toBeNull();
    fireEvent.press(screen.getByText('Dây buộc'));
    await waitFor(() => expect(screen.queryByText('Kẹp tóc nơ')).toBeNull());
    fireEvent.press(await screen.findByText('Dây buộc tóc'));

    view.resize({ width: 1180, height: 820, isTablet: true, isLandscape: true });
    expect(await screen.findByText('Giỏ hàng · 1 món')).toBeTruthy();
    expect(screen.getByText('Thanh toán · 12.000đ')).toBeTruthy();
    expect(screen.queryByText('Kẹp tóc nơ')).toBeNull(); // vẫn đang lọc nhóm "Dây buộc"

    view.resize({ width: 820, height: 1180, isTablet: true, isLandscape: false });
    await waitFor(() => expect(screen.queryByText(/^Giỏ hàng ·/)).toBeNull());
    expect(screen.getByText('Thanh toán')).toBeTruthy(); // thanh giỏ nổi
    expect(screen.queryByText('Kẹp tóc nơ')).toBeNull();
  });

  it('chưa biết kết quả: khung bên phải thành "Đang kiểm tra hoá đơn" với nút Kiểm tra lại', async () => {
    await setBranches([branch('b1', 'Chùa Láng')]);
    mockedSubmit.mockResolvedValue({ status: null, data: null });
    renderScreen();

    fireEvent.press(await screen.findByText('Dây buộc tóc'));
    await goToPayment('Thanh toán · 12.000đ');
    fireEvent.press(await screen.findByText('Hoàn tất bán'));

    expect(await screen.findByText('Đang kiểm tra hoá đơn')).toBeTruthy();
    fireEvent.press(screen.getByText('Kiểm tra lại'));
    expect(await screen.findByText('Vẫn chưa nhận được trả lời. Kiểm tra mạng rồi thử lại.')).toBeTruthy();
    expect(mockedSubmit).toHaveBeenCalledTimes(2);
    expect(mockedSubmit.mock.calls[1]![0].clientRequestId).toBe(mockedSubmit.mock.calls[0]![0].clientRequestId);

    // Bỏ kiểm tra (sau khi xác nhận): thôi theo dõi, giỏ giữ nguyên và bán tiếp được.
    fireEvent.press(screen.getByText('Bỏ kiểm tra'));
    expect(await screen.findByText('Giỏ hàng · 1 món')).toBeTruthy();
    expect(mockedConfirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }));
    expect(useCart.getState()).toMatchObject({ pending: null, lines: [{ key: 'p2', qty: 1 }] });
  });
});

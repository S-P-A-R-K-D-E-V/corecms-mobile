import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

let mockUser: any = null;
jest.mock('src/auth/auth-context', () => ({
  useAuthContext: () => ({ user: mockUser }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
}));
jest.mock('src/api/inspection', () => ({
  getInspection: jest.fn(),
  saveInspectionResults: jest.fn(),
  submitInspection: jest.fn(),
  uploadInspectionPhoto: jest.fn(),
}));
jest.mock('../inspection-photos', () => ({
  captureInspectionPhoto: jest.fn(),
  discardInspectionPhoto: jest.fn(() => Promise.resolve()),
  discardInspectionPhotos: jest.fn(() => Promise.resolve()),
}));
jest.mock('src/features/chat/ImageViewer', () => ({ ImageViewer: () => null }));
jest.mock('src/components/overlay', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
  confirm: jest.fn(() => Promise.resolve(true)),
}));

import { router } from 'expo-router';
import { toast } from 'src/components/overlay';
import * as api from 'src/api/inspection';
import { captureInspectionPhoto } from '../inspection-photos';
import { draftKey } from '../inspection-draft';
import { InspectionRunScreen } from '../InspectionRunScreen';
import type { IInspection } from 'src/types/inspection';

// Chạy checklist trên app: chấm ghi ngay xuống máy; nộp = tải ảnh trên máy → lưu kết quả kèm key ảnh → nộp. Ảnh
// không tải lên được thì chưa lưu, chưa nộp, kết quả vẫn trên máy. Không phải người kiểm thì chỉ xem.

const mocked = api as jest.Mocked<typeof api>;
const capture = captureInspectionPhoto as jest.MockedFunction<typeof captureInspectionPhoto>;

const item = (id: string, sortOrder: number) => ({
  id,
  code: id.toUpperCase(),
  groupName: 'Quầy',
  title: `Mục ${id}`,
  passCriteria: 'Sạch, gọn',
  level: 'Mandatory' as const,
  zones: ['A' as const],
  perStaff: false,
  observationsPerStaff: 1,
  requiresPhotoOnFail: true,
  requiresFix: true,
  sortOrder,
});

function inspection(over: Partial<IInspection['summary']> = {}): IInspection {
  return {
    summary: {
      id: 'insp-1', type: 'ShiftQuick', status: 'Draft', date: '2026-11-02', shiftScheduleId: 's1', shiftName: 'Tối',
      startTime: '18:00', endTime: '22:30', isSpotCheck: false, inspectorId: 'lan', inspectorName: 'Lan', submittedAt: null,
      passCount: 0, failCount: 0, notApplicableCount: 0, ...over,
    },
    note: null,
    zoneOwners: { zones: { A: 'lan' }, shiftLeadId: 'lan', staff: [{ staffId: 'lan', name: 'Lan' }] },
    template: { id: 't1', type: 'ShiftQuick', version: 1, name: 'Kiểm nhanh', items: [item('q1', 1), item('q2', 2)] },
    results: [],
  };
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InspectionRunScreen id="insp-1" />
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockUser = { id: 'lan', role: 'Staff', roles: ['Staff'], permissions: [] };
  mocked.getInspection.mockResolvedValue(inspection());
  capture.mockResolvedValue({ uri: 'file:///doc/inspection/insp-1-a.jpg', type: 'image/jpeg' });
  mocked.uploadInspectionPhoto.mockResolvedValue('inspections/insp-1/a.jpg');
  mocked.saveInspectionResults.mockImplementation(async () => inspection());
  mocked.submitInspection.mockResolvedValue(inspection({ status: 'Submitted', failCount: 1 }));
});

async function markPassAndFail() {
  await screen.findByText('Q1 · Mục q1');
  fireEvent.press(screen.getAllByText('Đạt')[0]);
  fireEvent.press(screen.getAllByText('Không đạt')[1]);
}

describe('InspectionRunScreen', () => {
  it('lỗi ở mục cần ảnh: phải chụp ảnh mới nộp; nộp = tải ảnh → lưu kèm key → nộp', async () => {
    renderScreen();
    await markPassAndFail();
    expect(screen.getByText(/1 lỗi chưa có ảnh/)).toBeTruthy();

    fireEvent.press(screen.getByText('Chụp ảnh lỗi (bắt buộc)'));
    await screen.findByText('Chưa gửi');
    expect(capture).toHaveBeenCalledWith('insp-1');

    fireEvent.press(screen.getByText('Nộp'));
    await waitFor(() => expect(mocked.submitInspection).toHaveBeenCalledWith('insp-1'));

    expect(mocked.uploadInspectionPhoto).toHaveBeenCalledWith('insp-1', { uri: 'file:///doc/inspection/insp-1-a.jpg', type: 'image/jpeg' });
    expect(mocked.saveInspectionResults).toHaveBeenCalledWith('insp-1', [
      { itemId: 'q1', observedStaffId: null, observationIndex: 0, outcome: 'Pass', note: null, faultPhotoKeys: null },
      { itemId: 'q2', observedStaffId: null, observationIndex: 0, outcome: 'Fail', note: null, faultPhotoKeys: ['inspections/insp-1/a.jpg'] },
    ]);
    // Thứ tự: ảnh lên xong mới lưu, lưu xong mới nộp.
    expect(mocked.uploadInspectionPhoto.mock.invocationCallOrder[0]).toBeLessThan(mocked.saveInspectionResults.mock.invocationCallOrder[0]);
    expect(mocked.saveInspectionResults.mock.invocationCallOrder[0]).toBeLessThan(mocked.submitInspection.mock.invocationCallOrder[0]);
    expect(router.back).toHaveBeenCalled();
    // Server đã giữ kết quả → bỏ bản nháp trên máy.
    expect(await AsyncStorage.getItem(draftKey('insp-1'))).toBeNull();
  });

  it('mỗi lần chấm ghi bản nháp xuống máy; mở lại màn vẫn còn', async () => {
    const first = renderScreen();
    await markPassAndFail();
    await waitFor(async () => expect(await AsyncStorage.getItem(draftKey('insp-1'))).toContain('"Fail"'));
    first.unmount();

    renderScreen();
    await screen.findByText('Q1 · Mục q1');
    expect(await screen.findByText(/Đã chấm 2\/2/)).toBeTruthy();
    expect(screen.getByText('Chụp ảnh lỗi (bắt buộc)')).toBeTruthy();
  });

  it('mất mạng lúc tải ảnh: chưa lưu, chưa nộp, kết quả + ảnh vẫn giữ trên máy', async () => {
    mocked.uploadInspectionPhoto.mockRejectedValueOnce(new Error('Mạng yếu hoặc mất kết nối'));
    renderScreen();
    await markPassAndFail();
    fireEvent.press(screen.getByText('Chụp ảnh lỗi (bắt buộc)'));
    await screen.findByText('Chưa gửi');

    fireEvent.press(screen.getByText('Nộp'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(mocked.saveInspectionResults).not.toHaveBeenCalled();
    expect(mocked.submitInspection).not.toHaveBeenCalled();
    const saved = await AsyncStorage.getItem(draftKey('insp-1'));
    expect(saved).toContain('insp-1-a.jpg');
  });

  it('không phải người kiểm: chỉ xem, không có nút Lưu / Nộp / chụp ảnh', async () => {
    mockUser = { id: 'mai', role: 'Staff', roles: ['Staff'], permissions: ['inspection.read'] };
    renderScreen();
    await screen.findByText('Q1 · Mục q1');
    expect(screen.getByText(/bạn chỉ xem/)).toBeTruthy();
    expect(screen.queryByText('Nộp')).toBeNull();
    expect(screen.queryByText('Lưu')).toBeNull();
  });
});

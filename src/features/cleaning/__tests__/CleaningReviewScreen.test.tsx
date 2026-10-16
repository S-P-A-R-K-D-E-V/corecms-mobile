import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockUser: any = null;
jest.mock('src/auth/auth-context', () => ({
  useAuthContext: () => ({ user: mockUser }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  router: { back: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('src/api/cleaning', () => ({
  getCleaningChecklist: jest.fn(),
  reviewCleaningTask: jest.fn(),
  getShiftStaffForPenalty: jest.fn(),
  createCleaningPenalty: jest.fn(),
}));

import { getCleaningChecklist } from 'src/api/cleaning';
import { CleaningReviewScreen } from '../CleaningReviewScreen';

// Chấm vệ sinh theo quyền (Core-be cleaning.*): vào màn cần cleaning.read (guard của route); nút Đạt / Không đạt cần
// cleaning.review, nút Phạt cần cleaning.penalty.manage — chỉ có quyền xem thì không thấy nút nào (API trả 403).

const mockedChecklist = getCleaningChecklist as jest.MockedFunction<typeof getCleaningChecklist>;

const task = (id: string, status: string) =>
  ({ id, name: `Việc ${id}`, area: null, status, completedByUserName: 'An', photoObjectKeys: [], penalties: [] }) as any;

async function renderWith(permissions: string[]) {
  mockUser = { role: 'Staff', roles: ['Staff'], permissions };
  mockedChecklist.mockReset().mockResolvedValue([task('done', 'Done'), task('failed', 'Failed')]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CleaningReviewScreen />
    </QueryClientProvider>
  );
  await waitFor(() => expect(mockedChecklist).toHaveBeenCalled());
  await screen.findByText('Việc done');
}

describe('CleaningReviewScreen — quyền', () => {
  it('chỉ có quyền xem: thấy checklist, không có nút chấm / phạt', async () => {
    await renderWith(['cleaning.read']);

    expect(screen.queryByText('Đạt')).toBeNull();
    // "Không đạt" chỉ còn là nhãn trạng thái của việc không đạt, không có nút.
    expect(screen.getAllByText('Không đạt')).toHaveLength(1);
    expect(screen.queryByText('Phạt')).toBeNull();
  });

  it('có quyền chấm: nút Đạt / Không đạt, chưa có nút Phạt', async () => {
    await renderWith(['cleaning.read', 'cleaning.review']);

    expect(screen.getByText('Đạt')).toBeTruthy();
    // Nhãn trạng thái của việc không đạt + nút ở việc đã xong.
    expect(screen.getAllByText('Không đạt')).toHaveLength(2);
    expect(screen.queryByText('Phạt')).toBeNull();
  });

  it('có quyền phạt: nút Phạt ở việc không đạt', async () => {
    await renderWith(['cleaning.read', 'cleaning.penalty.manage']);

    expect(screen.getByText('Phạt')).toBeTruthy();
    expect(screen.queryByText('Đạt')).toBeNull();
  });
});

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { CleaningChecklistSummaryCard } from '../CleaningChecklistSummaryCard';
import { getMyCleaningChecklist } from 'src/api/cleaning';
import type { IMyCleaningChecklist } from 'src/types/corecms-api';

jest.mock('src/api/cleaning', () => ({
  getMyCleaningChecklist: jest.fn(),
}));

const mockedGetMyCleaningChecklist = getMyCleaningChecklist as jest.MockedFunction<
  typeof getMyCleaningChecklist
>;

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const baseTask = {
  id: 't1',
  templateId: 'tpl1',
  name: 'Lau sàn',
  area: null,
  date: '2026-07-24',
  cleaningBlock: 'Morning' as const,
  completedByUserId: null,
  completedByUserName: null,
  completedAt: null,
  photoObjectKeys: [],
  reviewedByUserId: null,
  reviewedAt: null,
  reviewNote: null,
  penalties: [],
};

describe('CleaningChecklistSummaryCard', () => {
  beforeEach(() => {
    mockedGetMyCleaningChecklist.mockReset();
  });

  it('renders nothing when the fetch succeeds with zero tasks', async () => {
    mockedGetMyCleaningChecklist.mockResolvedValue([]);

    const { toJSON } = renderWithClient(<CleaningChecklistSummaryCard />);

    await waitFor(() => expect(mockedGetMyCleaningChecklist).toHaveBeenCalled());
    // Give react-query a tick to settle into the success state.
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it('renders a visible error indicator when the fetch fails', async () => {
    mockedGetMyCleaningChecklist.mockRejectedValue({ detail: 'Lỗi máy chủ' });

    renderWithClient(<CleaningChecklistSummaryCard />);

    expect(await screen.findByTestId('cleaning-summary-error')).toBeTruthy();
    expect(screen.getByText('Không tải được checklist vệ sinh')).toBeTruthy();
    expect(screen.getByText('Lỗi máy chủ')).toBeTruthy();
  });

  it('renders the done/total summary count on a successful response with tasks', async () => {
    const shifts: IMyCleaningChecklist[] = [
      {
        shiftAssignmentId: 'a1',
        shiftName: 'Ca sáng',
        cleaningBlock: 'Morning',
        tasks: [
          { ...baseTask, id: 't1', status: 'Passed' },
          { ...baseTask, id: 't2', status: 'Pending' },
        ],
      },
    ];
    mockedGetMyCleaningChecklist.mockResolvedValue(shifts);

    renderWithClient(<CleaningChecklistSummaryCard />);

    expect(await screen.findByText('Checklist vệ sinh ca này')).toBeTruthy();
    expect(screen.getByText('1/2 đầu việc đã xong')).toBeTruthy();
  });
});

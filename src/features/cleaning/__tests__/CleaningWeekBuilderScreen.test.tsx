import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { CleaningWeekBuilderScreen } from '../CleaningWeekBuilderScreen';
import {
  createCleaningTaskTemplate,
  getCleaningTaskDefinitions,
  getCleaningTemplateWeek,
} from 'src/api/cleaning';
import { getAllShiftTemplates } from 'src/api/schedule';

jest.mock('src/api/cleaning', () => ({
  getCleaningTaskDefinitions: jest.fn(),
  getCleaningTemplateWeek: jest.fn(),
  createCleaningTaskTemplate: jest.fn(),
  deleteCleaningTaskTemplate: jest.fn(),
  duplicateCleaningWeek: jest.fn(),
}));
jest.mock('src/api/schedule', () => ({
  getAllShiftTemplates: jest.fn(),
}));

const mockedGetDefs = getCleaningTaskDefinitions as jest.MockedFunction<typeof getCleaningTaskDefinitions>;
const mockedGetWeek = getCleaningTemplateWeek as jest.MockedFunction<typeof getCleaningTemplateWeek>;
const mockedGetShiftTemplates = getAllShiftTemplates as jest.MockedFunction<typeof getAllShiftTemplates>;
const mockedCreate = createCleaningTaskTemplate as jest.MockedFunction<typeof createCleaningTaskTemplate>;

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CleaningWeekBuilderScreen />
    </QueryClientProvider>
  );
}

describe('CleaningWeekBuilderScreen — shift-template picker', () => {
  beforeEach(() => {
    mockedGetDefs.mockReset().mockResolvedValue([
      { id: 'def-1', name: 'Lau sàn', area: 'Sảnh', isActive: true },
    ]);
    mockedGetWeek.mockReset().mockResolvedValue([]);
    mockedGetShiftTemplates.mockReset().mockResolvedValue([
      { id: 'st-1', name: 'Ca sáng', startTime: '06:00', endTime: '14:00', breakMinutes: 30, isActive: true },
      { id: 'st-2', name: 'Ca chiều', startTime: '14:00', endTime: '22:00', breakMinutes: 30, isActive: true },
    ]);
    mockedCreate.mockReset().mockResolvedValue({} as any);
  });

  it('requires at least one shift template selected before the create call is allowed', async () => {
    renderScreen();

    // Let all three initial queries settle before interacting, so no state
    // update from a lingering promise lands outside of act().
    await waitFor(() => expect(mockedGetDefs).toHaveBeenCalled());
    await waitFor(() => expect(mockedGetWeek).toHaveBeenCalled());
    await waitFor(() => expect(mockedGetShiftTemplates).toHaveBeenCalled());

    // Open the task-definition sheet for some day/block cell, then pick the definition.
    const addButtons = await screen.findAllByTestId(/^cleaning-add-/);
    fireEvent.press(addButtons[0]);
    fireEvent.press(await screen.findByTestId('cleaning-def-def-1'));

    // Step 2 sheet: shift-template picker opens; confirm button must start disabled.
    const confirmBtn = await screen.findByText(/^Xác nhận \(0 ca\)$/);
    fireEvent.press(confirmBtn);
    expect(mockedCreate).not.toHaveBeenCalled();

    // Select one shift template — the confirm label updates and submit now works.
    fireEvent.press(await screen.findByTestId('shift-template-st-1'));
    const confirmBtnEnabled = await screen.findByText(/^Xác nhận \(1 ca\)$/);
    fireEvent.press(confirmBtnEnabled);

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ shiftTemplateIds: ['st-1'] })
    );

    // Let the post-submit `invalidate()` refetch of the week query settle.
    await waitFor(() => expect(mockedGetWeek).toHaveBeenCalledTimes(2));
  });
});

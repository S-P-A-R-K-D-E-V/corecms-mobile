let mockParams: Record<string, unknown> = {};
const mockRedirect = jest.fn((_props: { href: unknown }) => null);
jest.mock('expo-router', () => ({
  Redirect: (props: { href: unknown }) => mockRedirect(props),
  useLocalSearchParams: () => mockParams,
}));

import React from 'react';
import { render } from '@testing-library/react-native';

import LegacyCleaning from 'src/app/manage/cleaning';
import LegacyCleaningBuilder from 'src/app/manage/cleaning-builder';
import LegacyCleaningReview from 'src/app/manage/cleaning-review';
import LegacyCleaningTasks from 'src/app/manage/cleaning-tasks';
import LegacyWorkDay from 'src/app/manage/work-day';
import LegacyWorkTasks from 'src/app/manage/work-tasks';

// Màn quản lý cũ (vệ sinh, chấm việc giao, việc theo ngày) đã gộp vào Công việc: route cũ chỉ còn chuyển hướng.

const hrefOf = (Screen: React.ComponentType, params: Record<string, unknown> = {}) => {
  mockParams = params;
  mockRedirect.mockClear();
  render(<Screen />);
  return mockRedirect.mock.calls[0]?.[0]?.href;
};

describe('route cũ → Công việc', () => {
  it('vệ sinh / lịch / việc theo ngày → đúng tab', () => {
    expect(hrefOf(LegacyCleaning)).toEqual({ pathname: '/manage/work-center', params: { tab: 'board', source: 'schedule' } });
    expect(hrefOf(LegacyCleaningBuilder)).toEqual({ pathname: '/manage/work-center', params: { tab: 'schedule' } });
    expect(hrefOf(LegacyCleaningTasks)).toEqual({ pathname: '/manage/work-center', params: { tab: 'schedule' } });
    expect(hrefOf(LegacyWorkDay)).toEqual({ pathname: '/manage/work-center', params: { tab: 'board' } });
  });

  it('chấm một ca / một việc giữ tham số', () => {
    expect(hrefOf(LegacyCleaningReview, { date: '2026-11-24', block: 'Morning' })).toEqual({
      pathname: '/manage/work-center/shift-review',
      params: { date: '2026-11-24', block: 'Morning' },
    });
    expect(hrefOf(LegacyWorkTasks, { id: 'abc' })).toEqual({ pathname: '/manage/work-center/task-review', params: { id: 'abc' } });
    expect(hrefOf(LegacyWorkTasks)).toEqual({ pathname: '/manage/work-center', params: { tab: 'assign' } });
  });
});

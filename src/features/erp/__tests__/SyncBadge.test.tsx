import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { useLocaleStore } from 'src/i18n';

import { SyncBadge } from '../shared';

// Nhãn KiotViet ở danh sách + chi tiết hoá đơn. Hoá đơn chỉ lưu trong hệ thống (NotPushed) phải trung tính:
// không nhãn "Đang đẩy KiotViet", không nhãn lỗi.

beforeEach(async () => {
  await useLocaleStore.getState().setPreference('vi');
});

describe('SyncBadge', () => {
  it.each(['NotPushed', 'None', 'Queued', '', null, undefined])('%p: không vẽ gì', (status) => {
    const { toJSON } = render(<SyncBadge status={status} />);
    expect(toJSON()).toBeNull();
  });

  it.each([
    ['Pending', 'Đang đẩy KiotViet'],
    ['Pushing', 'Đang đẩy KiotViet'],
    ['Synced', 'Đã lên KiotViet'],
    ['Failed', 'Lỗi đẩy KiotViet'],
  ])('%s: giữ nhãn "%s"', (status, label) => {
    render(<SyncBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('đổi ngôn ngữ thì nhãn đổi theo', async () => {
    await useLocaleStore.getState().setPreference('en');
    render(<SyncBadge status="Pending" />);
    expect(screen.getByText('Sending to KiotViet')).toBeTruthy();
  });
});

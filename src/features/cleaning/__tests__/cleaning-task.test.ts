import { needsPhoto, taskActionLabel } from '../cleaning-task';

// Việc theo ca trong "Việc của tôi": việc không bắt ảnh (mở / đóng cửa) chỉ bấm "Đã làm".

describe('cleaning-task', () => {
  it('requiresPhoto = false → không cần ảnh, nút "Đã làm"; thiếu cờ (core-be cũ) → cần ảnh', () => {
    expect(needsPhoto({ requiresPhoto: false })).toBe(false);
    expect(needsPhoto({ requiresPhoto: true })).toBe(true);
    expect(needsPhoto({})).toBe(true);
    expect(taskActionLabel({ requiresPhoto: false, status: 'Pending' }, 5)).toBe('Đã làm');
    expect(taskActionLabel({ status: 'Pending' }, 5)).toBe('Chọn ảnh & hoàn thành (tối đa 5)');
    expect(taskActionLabel({ requiresPhoto: true, status: 'Done' }, 5)).toBe('Chụp lại ảnh');
  });
});

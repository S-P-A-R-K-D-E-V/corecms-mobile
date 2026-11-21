import type { ICleaningTaskInstance } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Một việc theo ca trong "Việc của tôi" (phần thuần, test được): có cần ảnh không, nút làm gì.
// core-be cũ không trả requiresPhoto → coi như cần ảnh (hành vi cũ).
// ----------------------------------------------------------------------

export function needsPhoto(task: Pick<ICleaningTaskInstance, 'requiresPhoto'>): boolean {
  return task.requiresPhoto !== false;
}

/** Chữ trên nút: việc không cần ảnh → "Đã làm"; cần ảnh → chọn ảnh & hoàn thành / chụp lại. */
export function taskActionLabel(task: Pick<ICleaningTaskInstance, 'requiresPhoto' | 'status'>, maxPhotos: number): string {
  if (!needsPhoto(task)) return 'Đã làm';
  return task.status === 'Done' ? 'Chụp lại ảnh' : `Chọn ảnh & hoàn thành (tối đa ${maxPhotos})`;
}

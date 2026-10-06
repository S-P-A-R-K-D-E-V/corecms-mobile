import { vi } from 'src/i18n/locales/vi';
import { en } from 'src/i18n/locales/en';

import { isSaleQueuedForKiotViet, syncBadge } from '../kiotviet-sync';

// core-be `kiotVietSyncStatus`: None | Pending | Pushing | Synced | Failed | NotPushed. NotPushed = hoá đơn chỉ
// lưu trong hệ thống (cửa hàng không nối KiotViet, hoặc core-be tắt đẩy hoá đơn) — bình thường, không phải lỗi.

describe('nhãn đồng bộ KiotViet của hoá đơn', () => {
  it('Pending / Pushing: đang đẩy', () => {
    expect(syncBadge('Pending')).toEqual({ tone: 'info', icon: 'sync', labelKey: 'erp.syncPending' });
    expect(syncBadge('Pushing')).toEqual(syncBadge('Pending'));
  });

  it('Synced: đã lên KiotViet; Failed: lỗi đẩy', () => {
    expect(syncBadge('Synced')).toEqual({ tone: 'success', icon: 'check', labelKey: 'erp.synced' });
    expect(syncBadge('Failed')).toEqual({ tone: 'error', icon: 'alert-circle-outline', labelKey: 'erp.syncFailed' });
  });

  it('NotPushed (chỉ lưu trong hệ thống) không hiện nhãn — không phải "đang đẩy", không phải lỗi', () => {
    expect(syncBadge('NotPushed')).toBeNull();
  });

  it('None / trống: đơn từ KiotViet về, không hiện nhãn', () => {
    for (const s of ['None', '', null, undefined]) expect(syncBadge(s)).toBeNull();
  });

  it('trạng thái lạ (BE thêm giá trị mới, sai hoa thường) không rơi về "đang đẩy"', () => {
    for (const s of ['Queued', 'Local', 'pending', 'NOTPUSHED', ' Pending', 'constructor', 'toString', '0']) {
      expect([s, syncBadge(s)]).toEqual([s, null]);
    }
  });

  it('chữ trên nhãn có ở cả hai ngôn ngữ', () => {
    for (const s of ['Pending', 'Pushing', 'Synced', 'Failed']) {
      const [ns, key] = syncBadge(s)!.labelKey.split('.');
      expect(ns).toBe('erp');
      expect((vi.erp as Record<string, unknown>)[key]).toEqual(expect.any(String));
      expect((en.erp as Record<string, unknown>)[key]).toEqual(expect.any(String));
    }
  });
});

describe('bán xong: có nhắc "đang đẩy sang KiotViet" không', () => {
  it('chỉ khi core-be trả kiotVietSyncStatus = Pending', () => {
    expect(isSaleQueuedForKiotViet({ id: 's1', kiotVietSyncStatus: 'Pending' })).toBe(true);
  });

  it('NotPushed: hoá đơn chỉ lưu trong hệ thống → không nhắc', () => {
    expect(isSaleQueuedForKiotViet({ id: 's1', kiotVietSyncStatus: 'NotPushed' })).toBe(false);
  });

  it('core-be cũ chỉ trả id → không biết thì không nhắc', () => {
    expect(isSaleQueuedForKiotViet({ id: 's1' })).toBe(false);
    expect(isSaleQueuedForKiotViet({ id: 's1', kiotVietSyncStatus: null })).toBe(false);
  });

  it('trạng thái khác / body không phải object', () => {
    for (const status of ['Pushing', 'Synced', 'Failed', 'None', 'pending', true, 1]) {
      expect([status, isSaleQueuedForKiotViet({ id: 's1', kiotVietSyncStatus: status })]).toEqual([status, false]);
    }
    for (const body of [null, undefined, '', 's1', 'Pending', 0, []]) {
      expect([body, isSaleQueuedForKiotViet(body)]).toEqual([body, false]);
    }
  });
});

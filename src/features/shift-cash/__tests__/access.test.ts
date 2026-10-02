import { geoHeaders } from 'src/api/shiftCash';
import { useLocaleStore } from 'src/i18n';
import { evaluateGeofence } from 'src/services/geo';
import type { IBranchLocation, IMyScheduleItem } from 'src/types/corecms-api';

import {
  SHIFT_CASH_ERRORS,
  SHIFT_CASH_MAX_ACCURACY_M,
  decideShiftCashAccess,
  getShiftCashDenial,
  shiftCashDenialMessage,
  shiftCashDenialTitle,
  shiftCheckFrom,
} from '../access';

// Luật Kiểm quầy: Admin vào thẳng; Staff & Manager cần ca hôm nay + đang ở cửa hàng (GPS), lỗi kiểm tra
// thì chặn. BE từ chối → 403 { error: 'ShiftCash.*', message }.

const ready = { status: 'ready' as const, reason: null };

describe('decideShiftCashAccess', () => {
  it('Admin vào thẳng — không cần ca, không cần GPS, bỏ qua cả lỗi BE', () => {
    expect(decideShiftCashAccess({ bypass: true, serverDenied: true, shift: 'none', gps: { status: 'idle', reason: null } })).toEqual({ state: 'allow' });
  });

  it('kiểm tra ca trước GPS: chưa có ca thì không hỏi vị trí', () => {
    const idle = { status: 'idle' as const, reason: null };
    expect(decideShiftCashAccess({ bypass: false, serverDenied: false, shift: 'loading', gps: idle })).toEqual({ state: 'checking', step: 'shift' });
    expect(decideShiftCashAccess({ bypass: false, serverDenied: false, shift: 'none', gps: idle })).toEqual({ state: 'blocked', reason: 'no_shift' });
    expect(decideShiftCashAccess({ bypass: false, serverDenied: false, shift: 'error', gps: idle })).toEqual({ state: 'blocked', reason: 'shift_error' });
  });

  it('có ca: chờ GPS, lý do GPS thì chặn, đạt thì cho vào', () => {
    expect(decideShiftCashAccess({ bypass: false, serverDenied: false, shift: 'ok', gps: { status: 'loading', reason: null } })).toEqual({ state: 'checking', step: 'location' });
    for (const reason of ['permission', 'unavailable', 'mocked', 'branches_error', 'low_accuracy', 'outside'] as const) {
      expect(decideShiftCashAccess({ bypass: false, serverDenied: false, shift: 'ok', gps: { status: 'ready', reason } })).toEqual({ state: 'blocked', reason });
    }
    expect(decideShiftCashAccess({ bypass: false, serverDenied: false, shift: 'ok', gps: ready })).toEqual({ state: 'allow' });
  });

  it('BE vừa từ chối → chặn dù phía app đã đạt', () => {
    expect(decideShiftCashAccess({ bypass: false, serverDenied: true, shift: 'ok', gps: ready })).toEqual({ state: 'blocked', reason: 'server' });
  });
});

describe('shiftCheckFrom', () => {
  const today = '2026-10-02';
  const item = (date: string) => ({ assignmentId: 'a', date } as IMyScheduleItem);

  it('có ca hôm nay → ok, kể cả khi đang tải lại', () => {
    expect(shiftCheckFrom({ data: [item(today)], isFetching: true, isError: false }, today)).toBe('ok');
    expect(shiftCheckFrom({ data: [item(`${today}T00:00:00`)], isFetching: false, isError: true }, today)).toBe('ok');
  });

  it('không có ca / ca ngày khác → none; đang tải → loading; lỗi chưa có dữ liệu → error', () => {
    expect(shiftCheckFrom({ data: [], isFetching: false, isError: false }, today)).toBe('none');
    expect(shiftCheckFrom({ data: [item('2026-10-01')], isFetching: false, isError: false }, today)).toBe('none');
    expect(shiftCheckFrom({ data: [], isFetching: true, isError: false }, today)).toBe('loading');
    expect(shiftCheckFrom({ data: undefined, isFetching: true, isError: false }, today)).toBe('loading');
    expect(shiftCheckFrom({ data: undefined, isFetching: false, isError: true }, today)).toBe('error');
  });
});

describe('evaluateGeofence (khớp BE)', () => {
  const branch = (over: Partial<IBranchLocation>): IBranchLocation =>
    ({ id: 'b', branchName: 'CiCi Q1', geofenceRadius: 100, isActive: true, createdDate: '', ...over }) as IBranchLocation;
  const store = { latitude: 10.7769, longitude: 106.7009 };
  const atStore = { ...store, accuracy: 15 };
  // ~1.1 km về phía bắc.
  const away = { latitude: 10.7869, longitude: 106.7009, accuracy: 15 };

  it('không tải được chi nhánh → chặn (fail closed)', () => {
    expect(evaluateGeofence(atStore, null)).toMatchObject({ ok: false, reason: 'branches_error' });
  });

  it('không chi nhánh hoạt động nào có toạ độ → bỏ qua geofence', () => {
    expect(evaluateGeofence(away, [branch({})]).ok).toBe(true);
    expect(evaluateGeofence(away, [branch({ ...store, isActive: false })]).ok).toBe(true);
  });

  it('trong bán kính → đạt; ngoài → outside kèm chi nhánh gần nhất', () => {
    expect(evaluateGeofence(atStore, [branch(store)], { maxAccuracy: SHIFT_CASH_MAX_ACCURACY_M }).ok).toBe(true);
    const out = evaluateGeofence(away, [branch(store)], { maxAccuracy: SHIFT_CASH_MAX_ACCURACY_M });
    expect(out).toMatchObject({ ok: false, reason: 'outside' });
    expect(out.nearest?.branch.branchName).toBe('CiCi Q1');
    expect(out.nearest!.distance).toBeGreaterThan(1000);
  });

  it('chi nhánh ngừng hoạt động không tính, kể cả khi đứng ngay đó', () => {
    const closed = branch({ ...store, id: 'closed', isActive: false });
    const other = branch({ id: 'other', latitude: 10.8, longitude: 106.7 });
    expect(evaluateGeofence(atStore, [closed, other])).toMatchObject({ ok: false, reason: 'outside' });
  });

  it('xét BẤT KỲ chi nhánh nào trong bán kính, không chỉ chi nhánh gần nhất', () => {
    const near = branch({ id: 'near', latitude: 10.7875, longitude: 106.7009, geofenceRadius: 10 });
    const wide = branch({ id: 'wide', ...store, geofenceRadius: 2000 });
    expect(evaluateGeofence(away, [near, wide]).ok).toBe(true);
  });

  it('sai số > 200 m → low_accuracy; không có sai số → không chặn theo sai số', () => {
    expect(evaluateGeofence({ ...store, accuracy: 350 }, [branch(store)], { maxAccuracy: 200 })).toMatchObject({ ok: false, reason: 'low_accuracy' });
    expect(evaluateGeofence({ ...store, accuracy: 200 }, [branch(store)], { maxAccuracy: 200 }).ok).toBe(true);
    expect(evaluateGeofence(store, [branch(store)], { maxAccuracy: 200 }).ok).toBe(true);
  });
});

describe('geoHeaders', () => {
  it('gửi X-Geo-* khi có toạ độ, bỏ qua khi không có (Admin)', () => {
    expect(geoHeaders(null)).toEqual({});
    expect(geoHeaders({})).toEqual({});
    expect(geoHeaders({ latitude: 10.5 })).toEqual({});
    expect(geoHeaders({ latitude: 10.7769, longitude: 106.7009, accuracy: 12.5 })).toEqual({
      'X-Geo-Latitude': '10.7769',
      'X-Geo-Longitude': '106.7009',
      'X-Geo-Accuracy': '12.5',
    });
    expect(geoHeaders({ latitude: 0, longitude: 0 })).toEqual({ 'X-Geo-Latitude': '0', 'X-Geo-Longitude': '0' });
  });
});

describe('lỗi BE 403 ShiftCash.*', () => {
  const outside = { error: SHIFT_CASH_ERRORS.outsideStore, message: 'Bạn đang ở ngoài cửa hàng.' };

  afterEach(async () => {
    await useLocaleStore.getState().setPreference('vi');
  });

  it('nhận ra body { error, message } và kiểu ProblemDetails; lỗi khác → null', () => {
    expect(getShiftCashDenial(outside)).toEqual({ code: 'ShiftCash.OutsideStore', message: 'Bạn đang ở ngoài cửa hàng.' });
    expect(getShiftCashDenial({ title: 'Không có ca', errorCodes: ['ShiftCash.NoShiftToday'] })).toEqual({ code: 'ShiftCash.NoShiftToday', message: 'Không có ca' });
    expect(getShiftCashDenial({ errors: { 'ShiftCash.PastDateAdminOnly': ['x'] } })?.code).toBe('ShiftCash.PastDateAdminOnly');
    expect(getShiftCashDenial({ error: 'Feature.Disabled', message: 'x' })).toBeNull();
    expect(getShiftCashDenial({ errorCodes: ['Auth.Other'] })).toBeNull();
    expect(getShiftCashDenial('Something went wrong')).toBeNull();
    expect(getShiftCashDenial(null)).toBeNull();
  });

  it('tiếng Việt: dùng nguyên câu BE; tiếng Anh: dịch theo mã', async () => {
    const d = getShiftCashDenial(outside)!;
    await useLocaleStore.getState().setPreference('vi');
    expect(shiftCashDenialMessage(d)).toBe('Bạn đang ở ngoài cửa hàng.');
    expect(shiftCashDenialTitle(d)).toBe('Bạn đang ở ngoài cửa hàng');
    await useLocaleStore.getState().setPreference('en');
    expect(shiftCashDenialMessage(d)).toBe("You're outside the store area. Go to the counter, then try again.");
    expect(shiftCashDenialTitle(d)).toBe("You're outside the store");
    // Mã lạ: vẫn hiện câu BE; không có câu thì câu chung.
    expect(shiftCashDenialMessage({ code: 'ShiftCash.Other', message: 'BE nói vậy' })).toBe('BE nói vậy');
    expect(shiftCashDenialMessage({ code: 'ShiftCash.Other', message: null })).toBe(
      "The system isn't allowing a counter cash check right now. Please try again."
    );
  });
});

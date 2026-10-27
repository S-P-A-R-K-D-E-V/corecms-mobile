import {
  MAX_INSPECTION_PHOTOS,
  buildRows,
  entryKey,
  hasUnsavedChanges,
  needsPhoto,
  parseDraft,
  pendingPhotos,
  photosLeft,
  seedEntries,
  serializeDraft,
  submitBlockers,
  toResultInputs,
  withPhotoKey,
  type DraftEntry,
} from '../inspection-draft';
import type { IInspection, IInspectionResult, IInspectionTemplateItem } from 'src/types/inspection';

// Bản nháp lượt kiểm trên máy: chấm, ảnh chờ tải, điều kiện nộp — khớp core-be SaveInspectionResults / SubmitValidator.

const item = (id: string, over: Partial<IInspectionTemplateItem> = {}): IInspectionTemplateItem => ({
  id,
  code: id.toUpperCase(),
  groupName: 'Quầy',
  title: `Mục ${id}`,
  passCriteria: 'Sạch',
  level: 'Mandatory',
  zones: ['A'],
  perStaff: false,
  observationsPerStaff: 1,
  requiresPhotoOnFail: true,
  requiresFix: true,
  sortOrder: 0,
  ...over,
});

const result = (itemId: string, over: Partial<IInspectionResult> = {}): IInspectionResult => ({
  id: `r-${itemId}`,
  itemId,
  itemCode: itemId.toUpperCase(),
  level: 'Mandatory',
  observedStaffId: null,
  observationIndex: 0,
  outcome: 'Pass',
  note: null,
  responsibleStaffId: null,
  zoneUnassigned: false,
  recordedAt: '2026-11-02T11:30:00Z',
  fixDeadlineAt: null,
  fixedAt: null,
  fixNote: null,
  isOverdue: false,
  photos: [],
  ...over,
});

function inspection(items: IInspectionTemplateItem[], results: IInspectionResult[] = []): IInspection {
  return {
    summary: {
      id: 'insp-1', type: 'ShiftQuick', status: 'Draft', date: '2026-11-02', shiftScheduleId: 's1', shiftName: 'Tối',
      startTime: '18:00', endTime: '22:30', isSpotCheck: false, inspectorId: 'lan', inspectorName: 'Lan', submittedAt: null,
      passCount: 0, failCount: 0, notApplicableCount: 0,
    },
    note: null,
    zoneOwners: { zones: { A: 'lan' }, shiftLeadId: 'lan', staff: [{ staffId: 'lan', name: 'Lan' }, { staffId: 'mai', name: 'Mai' }] },
    template: { id: 't1', type: 'ShiftQuick', version: 1, name: 'Kiểm nhanh', items },
    results,
  };
}

const fail = (photos: DraftEntry['photos'] = [], note = ''): DraftEntry => ({ outcome: 'Fail', note, photos });
const pass: DraftEntry = { outcome: 'Pass', note: '', photos: [] };

describe('buildRows', () => {
  it('mục thường 1 dòng; mục theo người = mỗi người trong ca × mỗi lượt, theo thứ tự bảng kiểm', () => {
    const rows = buildRows(
      inspection([item('q2', { sortOrder: 2 }), item('t1', { sortOrder: 1, perStaff: true, observationsPerStaff: 3 })])
    );
    expect(rows.map((r) => r.key)).toEqual([
      entryKey('t1', 'lan', 0), entryKey('t1', 'lan', 1), entryKey('t1', 'lan', 2),
      entryKey('t1', 'mai', 0), entryKey('t1', 'mai', 1), entryKey('t1', 'mai', 2),
      entryKey('q2', null, 0),
    ]);
    expect(rows[3].observedStaffName).toBe('Mai');
  });

  it('gắn kết quả đã lưu trên server vào đúng dòng', () => {
    const rows = buildRows(inspection([item('q1')], [result('q1', { outcome: 'Fail' })]));
    expect(rows[0].server?.outcome).toBe('Fail');
  });
});

describe('seedEntries', () => {
  it('server làm gốc, dòng có trong bản nháp trên máy thì lấy bản nháp', () => {
    const rows = buildRows(inspection([item('q1'), item('q2')], [result('q1', { outcome: 'Pass' }), result('q2', { outcome: 'Pass' })]));
    const local = { [entryKey('q2', null, 0)]: fail([{ uri: 'file:///a.jpg', type: 'image/jpeg' }], 'Bụi') };
    const entries = seedEntries(rows, local);
    expect(entries[entryKey('q1', null, 0)].outcome).toBe('Pass');
    expect(entries[entryKey('q2', null, 0)]).toEqual(local[entryKey('q2', null, 0)]);
  });
});

describe('ảnh lỗi và điều kiện nộp', () => {
  it('lỗi ở mục cần ảnh: thiếu ảnh chặn nộp; ảnh đã lên server cũng tính', () => {
    const rows = buildRows(inspection([item('q1'), item('q2', { requiresPhotoOnFail: false })]));
    const k1 = entryKey('q1', null, 0);
    const k2 = entryKey('q2', null, 0);

    expect(submitBlockers(rows, {})).toEqual({ unanswered: 2, missingPhoto: 0, ready: false });
    expect(submitBlockers(rows, { [k1]: fail(), [k2]: fail() })).toEqual({ unanswered: 0, missingPhoto: 1, ready: false });
    expect(needsPhoto(rows[1], fail())).toBe(false);
    expect(submitBlockers(rows, { [k1]: fail([{ uri: 'file:///a.jpg', type: 'image/jpeg' }]), [k2]: pass }).ready).toBe(true);

    const withServerPhoto = buildRows(
      inspection([item('q1')], [result('q1', { outcome: 'Fail', photos: [{ id: 'p', kind: 'Fault', url: 'inspections/x.jpg', uploadedAt: '' }] })])
    );
    expect(needsPhoto(withServerPhoto[0], fail())).toBe(false);
    expect(photosLeft(withServerPhoto[0], fail([{ uri: 'file:///a.jpg', type: 'image/jpeg' }]))).toBe(MAX_INSPECTION_PHOTOS - 2);
  });

  it('chưa có dòng nào thì không nộp được', () => {
    expect(submitBlockers([], {}).ready).toBe(false);
  });
});

describe('gửi lên server', () => {
  const rows = buildRows(inspection([item('q1'), item('q2'), item('q3')]));
  const [k1, k2, k3] = rows.map((r) => r.key);

  it('chỉ gửi dòng đã chấm; ảnh gửi key đã tải lên; ghi chú chỉ cho lỗi', () => {
    const entries = {
      [k1]: fail([{ uri: 'file:///a.jpg', type: 'image/jpeg', key: 'inspections/insp-1/a.jpg' }, { uri: 'file:///b.jpg', type: 'image/jpeg' }], '  Kệ bụi  '),
      [k2]: { outcome: 'Pass' as const, note: 'không gửi', photos: [] },
    };
    expect(toResultInputs(rows, entries)).toEqual([
      { itemId: 'q1', observedStaffId: null, observationIndex: 0, outcome: 'Fail', note: 'Kệ bụi', faultPhotoKeys: ['inspections/insp-1/a.jpg'] },
      { itemId: 'q2', observedStaffId: null, observationIndex: 0, outcome: 'Pass', note: null, faultPhotoKeys: null },
    ]);
    expect(entries[k3]).toBeUndefined();
  });

  it('ảnh chờ tải chỉ của dòng "Không đạt"; tải xong ghi key vào bản mới', () => {
    const entries = {
      [k1]: fail([{ uri: 'file:///a.jpg', type: 'image/jpeg' }, { uri: 'file:///b.jpg', type: 'image/jpeg', key: 'k-b' }]),
      [k2]: { outcome: 'Pass' as const, note: '', photos: [{ uri: 'file:///c.jpg', type: 'image/jpeg' }] },
    };
    expect(pendingPhotos(entries).map((p) => [p.key, p.index])).toEqual([[k1, 0]]);

    const next = withPhotoKey(entries, k1, 0, 'k-a');
    expect(next[k1].photos.map((p) => p.key)).toEqual(['k-a', 'k-b']);
    expect(entries[k1].photos[0].key).toBeUndefined();
    expect(pendingPhotos(next)).toEqual([]);
  });

  it('có thay đổi chưa lưu: đổi kết quả / ghi chú, hoặc còn ảnh trên máy', () => {
    const saved = buildRows(inspection([item('q1')], [result('q1', { outcome: 'Fail', note: 'Bụi' })]));
    const k = saved[0].key;
    expect(hasUnsavedChanges(saved, seedEntries(saved, null))).toBe(false);
    expect(hasUnsavedChanges(saved, { [k]: fail([], 'Bụi') })).toBe(false);
    expect(hasUnsavedChanges(saved, { [k]: fail([], 'Bụi nhiều') })).toBe(true);
    expect(hasUnsavedChanges(saved, { [k]: pass })).toBe(true);
    expect(hasUnsavedChanges(saved, { [k]: fail([{ uri: 'file:///a.jpg', type: 'image/jpeg' }], 'Bụi') })).toBe(true);
  });
});

describe('lưu bản nháp xuống máy', () => {
  it('đọc lại đúng bản đã lưu', () => {
    const entries = { k: fail([{ uri: 'file:///a.jpg', type: 'image/jpeg', key: 'k-a' }], 'Bụi') };
    expect(parseDraft(serializeDraft('insp-1', entries, 1), 'insp-1')).toEqual(entries);
  });

  it('hỏng / sai dạng / của lượt khác → null; dòng lạ bị lọc, ảnh tối đa 3', () => {
    expect(parseDraft(null, 'insp-1')).toBeNull();
    expect(parseDraft('{oops', 'insp-1')).toBeNull();
    expect(parseDraft(serializeDraft('insp-2', {}, 1), 'insp-1')).toBeNull();

    const raw = JSON.stringify({
      v: 1,
      inspectionId: 'insp-1',
      entries: {
        a: { outcome: 'Bad', note: 5, photos: [{ uri: '', type: 'image/jpeg' }, { uri: 'file:///1.jpg', type: 'image/jpeg' }] },
        b: null,
        c: { outcome: 'Fail', photos: Array.from({ length: 5 }, (_, i) => ({ uri: `file:///${i}.jpg`, type: 'image/jpeg' })) },
      },
    });
    const parsed = parseDraft(raw, 'insp-1')!;
    expect(parsed.a).toEqual({ outcome: null, note: '', photos: [{ uri: 'file:///1.jpg', type: 'image/jpeg' }] });
    expect(parsed.b).toBeUndefined();
    expect(parsed.c.photos).toHaveLength(MAX_INSPECTION_PHOTOS);
  });
});

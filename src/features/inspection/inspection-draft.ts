import { PrefKeys } from 'src/services/storage';
import type {
  IInspection,
  IInspectionResult,
  IInspectionResultInput,
  IInspectionTemplateItem,
  InspectionOutcome,
} from 'src/types/inspection';

// ----------------------------------------------------------------------
// Bản nháp lượt kiểm trên máy (phần thuần, test được). Mỗi lần chấm / ghi chú / chụp ảnh là ghi ngay xuống máy, nên
// tắt app, mất mạng giữa chừng không mất kết quả. Ảnh nằm trên máy tới khi tải lên được (có key); lưu kết quả lên
// server thành công thì bỏ bản nháp, lấy lại theo server.
// ----------------------------------------------------------------------

/** Tối đa ảnh mỗi kết quả — trùng core-be InspectionPhotoKeys.MaxPhotosPerResult. */
export const MAX_INSPECTION_PHOTOS = 3;

export type DraftPhoto = { uri: string; type: string; key?: string };

export type DraftEntry = { outcome: InspectionOutcome | null; note: string; photos: DraftPhoto[] };

export type InspectionRow = {
  key: string;
  item: IInspectionTemplateItem;
  observedStaffId: string | null;
  observedStaffName: string | null;
  observationIndex: number;
  server: IInspectionResult | undefined;
};

export const entryKey = (itemId: string, observedStaffId: string | null, observationIndex: number) =>
  `${itemId}:${observedStaffId ?? '-'}:${observationIndex}`;

export const draftKey = (inspectionId: string) => `${PrefKeys.inspectionDraft}.${inspectionId}`;

/** Các dòng cần chấm: mục thường 1 dòng; mục theo người = mỗi người trong ca × mỗi lượt quan sát. */
export function buildRows(inspection: IInspection): InspectionRow[] {
  const results = new Map(
    inspection.results.map((r) => [entryKey(r.itemId, r.observedStaffId, r.observationIndex), r] as const)
  );
  const items = [...inspection.template.items].sort((a, b) => a.sortOrder - b.sortOrder);
  return items.flatMap((item): InspectionRow[] => {
    if (!item.perStaff) {
      const key = entryKey(item.id, null, 0);
      return [{ key, item, observedStaffId: null, observedStaffName: null, observationIndex: 0, server: results.get(key) }];
    }
    const observations = Math.max(1, item.observationsPerStaff);
    return inspection.zoneOwners.staff.flatMap((s) =>
      Array.from({ length: observations }, (_, i) => {
        const key = entryKey(item.id, s.staffId, i);
        return { key, item, observedStaffId: s.staffId, observedStaffName: s.name, observationIndex: i, server: results.get(key) };
      })
    );
  });
}

/** Kết quả đã lưu trên server làm gốc; dòng nào có trong bản nháp trên máy thì lấy bản nháp. */
export function seedEntries(rows: readonly InspectionRow[], draft: Record<string, DraftEntry> | null): Record<string, DraftEntry> {
  const out: Record<string, DraftEntry> = {};
  for (const row of rows) {
    const local = draft?.[row.key];
    if (local) out[row.key] = local;
    else if (row.server) out[row.key] = { outcome: row.server.outcome, note: row.server.note ?? '', photos: [] };
  }
  return out;
}

const faultPhotosOnServer = (row: InspectionRow) => row.server?.photos.filter((p) => p.kind === 'Fault').length ?? 0;

/** Số ảnh còn thêm được cho dòng này (tính cả ảnh đã lên server). */
export function photosLeft(row: InspectionRow, entry: DraftEntry | undefined): number {
  return Math.max(0, MAX_INSPECTION_PHOTOS - faultPhotosOnServer(row) - (entry?.photos.length ?? 0));
}

/** Không đạt ở mục cần ảnh mà chưa có ảnh nào (trên máy hoặc trên server). */
export function needsPhoto(row: InspectionRow, entry: DraftEntry | undefined): boolean {
  return (
    entry?.outcome === 'Fail' &&
    row.item.requiresPhotoOnFail &&
    faultPhotosOnServer(row) + entry.photos.length === 0
  );
}

/** Còn gì chặn nộp: dòng chưa chấm, lỗi chưa có ảnh (core-be SubmitValidator kiểm lại). */
export function submitBlockers(rows: readonly InspectionRow[], entries: Record<string, DraftEntry>) {
  let unanswered = 0;
  let missingPhoto = 0;
  for (const row of rows) {
    const entry = entries[row.key];
    if (!entry?.outcome) unanswered++;
    else if (needsPhoto(row, entry)) missingPhoto++;
  }
  return { unanswered, missingPhoto, ready: rows.length > 0 && unanswered === 0 && missingPhoto === 0 };
}

/** Ảnh trên máy chưa tải lên (chưa có key). */
export function pendingPhotos(entries: Record<string, DraftEntry>): { key: string; index: number; photo: DraftPhoto }[] {
  return Object.entries(entries).flatMap(([key, entry]) =>
    entry.outcome !== 'Fail' ? [] : entry.photos.flatMap((photo, index) => (photo.key ? [] : [{ key, index, photo }]))
  );
}

/** Ghi object key cho ảnh thứ `index` của dòng `key` sau khi tải lên xong (bản mới, không sửa bản cũ). */
export function withPhotoKey(
  entries: Record<string, DraftEntry>,
  key: string,
  index: number,
  objectKey: string
): Record<string, DraftEntry> {
  const entry = entries[key];
  if (!entry?.photos[index]) return entries;
  const photos = entry.photos.map((p, i) => (i === index ? { ...p, key: objectKey } : p));
  return { ...entries, [key]: { ...entry, photos } };
}

/** Kết quả gửi lên PUT inspections/{id}/results — chỉ dòng đã chấm; ảnh gửi key đã tải lên (server bỏ key trùng). */
export function toResultInputs(rows: readonly InspectionRow[], entries: Record<string, DraftEntry>): IInspectionResultInput[] {
  return rows.flatMap((row) => {
    const entry = entries[row.key];
    if (!entry?.outcome) return [];
    const keys = entry.photos.flatMap((p) => (p.key ? [p.key] : []));
    return [
      {
        itemId: row.item.id,
        observedStaffId: row.observedStaffId,
        observationIndex: row.observationIndex,
        outcome: entry.outcome,
        note: entry.outcome === 'Fail' && entry.note.trim() ? entry.note.trim() : null,
        faultPhotoKeys: entry.outcome === 'Fail' && keys.length ? keys : null,
      },
    ];
  });
}

/** Trên máy có gì khác server: dòng đổi kết quả / ghi chú, hoặc còn ảnh chưa gửi. */
export function hasUnsavedChanges(rows: readonly InspectionRow[], entries: Record<string, DraftEntry>): boolean {
  return rows.some((row) => {
    const entry = entries[row.key];
    if (!entry) return false;
    if (entry.photos.length > 0) return true;
    if (!row.server) return entry.outcome !== null;
    return entry.outcome !== row.server.outcome || entry.note.trim() !== (row.server.note ?? '');
  });
}

const OUTCOMES: readonly InspectionOutcome[] = ['Pass', 'Fail', 'NotApplicable'];

function readEntry(v: any): DraftEntry | null {
  if (!v || typeof v !== 'object') return null;
  const outcome = OUTCOMES.includes(v.outcome) ? (v.outcome as InspectionOutcome) : null;
  const photos: DraftPhoto[] = Array.isArray(v.photos)
    ? v.photos
        .filter((p: any) => p && typeof p.uri === 'string' && p.uri && typeof p.type === 'string')
        .map((p: any) => (typeof p.key === 'string' && p.key ? { uri: p.uri, type: p.type, key: p.key } : { uri: p.uri, type: p.type }))
        .slice(0, MAX_INSPECTION_PHOTOS)
    : [];
  return { outcome, note: typeof v.note === 'string' ? v.note : '', photos };
}

export function serializeDraft(inspectionId: string, entries: Record<string, DraftEntry>, now: number): string {
  return JSON.stringify({ v: 1, inspectionId, entries, savedAt: now });
}

/** Đọc bản nháp đã lưu; hỏng / sai dạng / của lượt kiểm khác → null. */
export function parseDraft(raw: string | null | undefined, inspectionId: string): Record<string, DraftEntry> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || v.v !== 1 || v.inspectionId !== inspectionId || !v.entries || typeof v.entries !== 'object') return null;
    const out: Record<string, DraftEntry> = {};
    for (const [key, value] of Object.entries(v.entries)) {
      const entry = readEntry(value);
      if (entry) out[key] = entry;
    }
    return out;
  } catch {
    return null;
  }
}

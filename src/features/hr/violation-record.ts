import type { IViolationRule, IViolationStaff } from 'src/types/hr';

// ----------------------------------------------------------------------
// Logic thuần của màn "Ghi vi phạm" (RecordViolationScreen): tìm không dấu, "Hay dùng", nhóm danh mục, điều kiện được bấm
// Ghi nhận. Tách riêng để test bằng jest, không phụ thuộc React Native.
// ----------------------------------------------------------------------

export const MAX_PHOTOS = 5;
export const MAX_QUANTITY = 50;
export const MAX_NEW_RULE_POINTS = 20;
/** Nhóm của loại vi phạm thêm nhanh khi không chọn nhóm (khớp core-be ViolationHandlers.NewRuleGroup). */
export const NEW_RULE_GROUP = 'Khác';
export const NOTE_PRESETS = ['Camera', 'Quản lý thấy trực tiếp', 'Khách phản ánh'] as const;

/** "Ngọc Ánh" → "ngoc anh": bỏ dấu, chữ thường, gộp khoảng trắng — để gõ "ngoc" ra "Ngọc". */
export function foldVi(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Khớp khi mọi từ trong ô tìm đều có trong chữ (không dấu, không phân biệt thứ tự). */
export function matches(text: string, query: string): boolean {
  const q = foldVi(query);
  if (!q) return true;
  const t = foldVi(text);
  return q.split(' ').every((w) => t.includes(w));
}

export function searchStaff(staff: IViolationStaff[], query: string): IViolationStaff[] {
  return staff.filter((s) => matches(s.fullName, query));
}

/** Tên ngắn trên hàng ảnh đại diện: tên gọi (từ cuối) — "Trần Thị Ngọc" → "Ngọc". */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] ?? fullName;
}

/** Luật đang bật, ghi tay nhiều nhất 30 ngày qua, tối đa `n`; chưa ai ghi thì lấy theo thứ tự danh mục, bỏ luật tự ghi. */
export function topRules(rules: IViolationRule[], n = 6): IViolationRule[] {
  const active = rules.filter((r) => r.isActive);
  const used = active
    .filter((r) => (r.recentUseCount ?? 0) > 0)
    .sort((a, b) => (b.recentUseCount ?? 0) - (a.recentUseCount ?? 0));
  if (used.length >= n) return used.slice(0, n);
  const rest = active.filter((r) => !used.includes(r) && r.autoSource === 'None');
  return [...used, ...rest].slice(0, n);
}

/** Danh mục theo nhóm (giữ thứ tự danh mục), lọc theo ô tìm (tên hoặc nhóm). */
export function groupRules(rules: IViolationRule[], query: string): { group: string; rules: IViolationRule[] }[] {
  const out: { group: string; rules: IViolationRule[] }[] = [];
  for (const r of rules) {
    if (!r.isActive || !(matches(r.name, query) || matches(r.groupName, query))) continue;
    const g = out.find((x) => x.group === r.groupName);
    if (g) g.rules.push(r);
    else out.push({ group: r.groupName, rules: [r] });
  }
  return out;
}

/** Ô tìm trùng hẳn tên một luật (không dấu) → không gợi ý thêm loại mới. */
export function exactRule(rules: IViolationRule[], name: string): IViolationRule | undefined {
  const n = foldVi(name);
  return n ? rules.find((r) => foldVi(r.name) === n) : undefined;
}

export type NewRuleDraft = { name: string; groupName: string; points: number; component: 'Discipline' | 'Reconciliation' };

export function newRuleValid(d: NewRuleDraft | null): boolean {
  return !!d && d.name.trim().length > 0 && d.name.trim().length <= 400 && d.points >= 1 && d.points <= MAX_NEW_RULE_POINTS;
}

export type PhotoStatus = 'uploading' | 'done' | 'error';

export type SubmitState = {
  people: number;
  hasRule: boolean;
  newRule: NewRuleDraft | null;
  quantity: number;
  note: string;
  photos: { status: PhotoStatus }[];
};

/** Lý do chưa bấm Ghi nhận được (null = được). Căn cứ: ảnh đã tải xong hoặc chữ, ít nhất một. */
export function blockReason(s: SubmitState): string | null {
  if (s.people === 0) return 'Chọn người vi phạm';
  if (!s.hasRule && !newRuleValid(s.newRule)) return s.newRule ? 'Nhập tên và điểm của loại mới' : 'Chọn lỗi vi phạm';
  if (!Number.isInteger(s.quantity) || s.quantity < 1 || s.quantity > MAX_QUANTITY) return `Số lần từ 1 tới ${MAX_QUANTITY}`;
  const uploading = s.photos.filter((p) => p.status === 'uploading').length;
  if (uploading > 0) return `Đang tải ${uploading} ảnh…`;
  if (s.photos.some((p) => p.status === 'error')) return 'Có ảnh chưa tải được — bấm để thử lại hoặc bỏ ảnh';
  if (!s.note.trim() && !s.photos.some((p) => p.status === 'done')) return 'Thêm ảnh hoặc ghi căn cứ';
  return null;
}

/** Bấm chip căn cứ: ô trống thì điền, đã có chữ thì nối "; …"; chip đã có trong chữ thì bỏ ra. */
export function toggleNotePreset(note: string, preset: string): string {
  const parts = note.split(';').map((p) => p.trim()).filter(Boolean);
  const i = parts.indexOf(preset);
  if (i >= 0) parts.splice(i, 1);
  else parts.push(preset);
  return parts.join('; ');
}

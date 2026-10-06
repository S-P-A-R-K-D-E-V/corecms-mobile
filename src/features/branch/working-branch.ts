import { create } from 'zustand';

import { prefs, PrefKeys } from 'src/services/storage';
import type { IBranchLocation } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Chi nhánh đang làm việc của MÁY này — lưu theo từng cửa hàng (AsyncStorage `pref.workingBranch.<mã cửa hàng>`).
//   - nạp từ máy trước khi dựng thanh tab (StoreScopeGate) để màn nào cũng đọc được ngay;
//   - đối chiếu với GET /branches (chỉ chi nhánh đang hoạt động): cửa hàng có đúng 1 chi nhánh → tự chọn;
//     nhiều chi nhánh mà chưa chọn / chi nhánh đã chọn không còn → `needsPick`, màn Bán hàng mở bảng chọn;
//   - đổi cửa hàng → quên chi nhánh của cửa hàng cũ (store-scope.ts).
// Mỗi chi nhánh đúng một loại hình ("retail" | "fnb") — loại hình quyết định màn bán hàng và tiện ích F&B.
// ----------------------------------------------------------------------

export type BranchType = 'retail' | 'fnb';

export type WorkingBranch = { id: string; name: string; type: BranchType };

/** 'first' = cửa hàng nhiều chi nhánh, máy chưa chọn lần nào · 'gone' = chi nhánh đã chọn không còn hoạt động. */
export type BranchPickReason = 'first' | 'gone';

/** Loại hình từ API; core-be cũ không trả, giá trị lạ → "retail" (F&B chỉ bật khi API nói rõ "fnb"). */
export function branchTypeOf(value: unknown): BranchType {
  return typeof value === 'string' && value.trim().toLowerCase() === 'fnb' ? 'fnb' : 'retail';
}

/** Các chi nhánh ĐANG HOẠT ĐỘNG của cửa hàng, giữ thứ tự API trả. */
export function activeBranches(list: readonly IBranchLocation[] | null | undefined): WorkingBranch[] {
  return (Array.isArray(list) ? list : [])
    .filter((b) => !!b && typeof b.id === 'string' && b.isActive)
    .map((b) => ({ id: b.id, name: b.branchName, type: branchTypeOf(b.businessType) }));
}

export type BranchSnapshot = {
  branch: WorkingBranch | null;
  options: WorkingBranch[];
  needsPick: BranchPickReason | null;
};

/**
 * Đối chiếu chi nhánh đã lưu với danh sách vừa hỏi được:
 *   - còn trong danh sách → giữ (lấy lại tên / loại hình mới nhất);
 *   - không còn (hoặc chưa chọn) mà cửa hàng có đúng 1 chi nhánh → tự chọn chi nhánh đó;
 *   - nhiều chi nhánh → bỏ chọn, chờ người dùng chọn ('first' / 'gone');
 *   - không có chi nhánh nào đang hoạt động → không có chi nhánh, không hỏi.
 */
export function reconcileBranches(stored: WorkingBranch | null, list: readonly IBranchLocation[] | null | undefined): BranchSnapshot {
  const options = activeBranches(list);
  const current = stored ? options.find((b) => b.id === stored.id) : undefined;
  if (current) return { branch: current, options, needsPick: null };
  if (options.length === 1) return { branch: options[0]!, options, needsPick: null };
  if (options.length === 0) return { branch: null, options, needsPick: null };
  return { branch: null, options, needsPick: stored ? 'gone' : 'first' };
}

export const branchKey = (scope: string) => `${PrefKeys.workingBranch}.${scope}`;

/** Đọc chi nhánh đã lưu; hỏng / sai dạng → null. */
export function parseStoredBranch(raw: string | null | undefined): WorkingBranch | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<WorkingBranch> | null;
    if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !v.id) return null;
    return { id: v.id, name: typeof v.name === 'string' ? v.name : '', type: branchTypeOf(v.type) };
  } catch {
    return null;
  }
}

type WorkingBranchState = {
  /** Mã cửa hàng của dữ liệu đang giữ; null = chưa nạp. */
  scope: string | null;
  /** Đã đọc xong chi nhánh đã lưu của `scope`. */
  hydrated: boolean;
  branch: WorkingBranch | null;
  /** Chi nhánh đang hoạt động theo lần hỏi GET /branches gần nhất; null = chưa hỏi được (mất mạng…). */
  options: WorkingBranch[] | null;
  needsPick: BranchPickReason | null;
  /** Đọc chi nhánh đã lưu của cửa hàng `scope` — không bao giờ ném lỗi. */
  hydrate: (scope: string) => Promise<void>;
  /** Đối chiếu với kết quả GET /branches. */
  reconcile: (list: readonly IBranchLocation[] | null | undefined) => void;
  /** Người dùng chọn 1 chi nhánh trong `options`. */
  select: (id: string) => void;
  /** Quên chi nhánh của cửa hàng `scope` (đổi cửa hàng). */
  clear: (scope: string) => Promise<void>;
};

function persist(scope: string, branch: WorkingBranch | null) {
  const key = branchKey(scope);
  (branch ? prefs.set(key, JSON.stringify(branch)) : prefs.remove(key)).catch(() => {});
}

const sameBranch = (a: WorkingBranch | null, b: WorkingBranch | null) =>
  a === b || (!!a && !!b && a.id === b.id && a.name === b.name && a.type === b.type);

export const useWorkingBranch = create<WorkingBranchState>((set, get) => ({
  scope: null,
  hydrated: false,
  branch: null,
  options: null,
  needsPick: null,

  async hydrate(scope) {
    const s = get();
    if (s.hydrated && s.scope === scope) return;
    set({ scope, hydrated: false, branch: null, options: null, needsPick: null });
    let stored: WorkingBranch | null = null;
    try {
      stored = parseStoredBranch(await prefs.get(branchKey(scope)));
    } catch {
      // Không đọc được → coi như chưa chọn; GET /branches sẽ tự chọn / hỏi lại.
    }
    if (get().scope !== scope) return; // đã sang cửa hàng khác trong lúc đọc
    set({ branch: stored, hydrated: true });
  },

  reconcile(list) {
    const s = get();
    if (!s.hydrated || !s.scope) return;
    const next = reconcileBranches(s.branch, list);
    set(next);
    if (!sameBranch(s.branch, next.branch)) persist(s.scope, next.branch);
  },

  select(id) {
    const s = get();
    const picked = s.options?.find((b) => b.id === id);
    if (!picked || !s.scope) return;
    set({ branch: picked, needsPick: null });
    persist(s.scope, picked);
  },

  async clear(scope) {
    if (get().scope === scope) set({ scope: null, hydrated: false, branch: null, options: null, needsPick: null });
    await prefs.remove(branchKey(scope)).catch(() => {});
  },
}));

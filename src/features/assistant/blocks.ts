import type { AuthUser } from 'src/auth/auth-context';
import { resolveRoute } from './assistant-routes';
import { parseHttpUrl } from './links';

// ----------------------------------------------------------------------
// Kiểm lại khối có cấu trúc của câu trả lời (contract ASSISTANT CHAT v1 §2–3) trước khi hiển thị.
// Server (AssistantBlockPolicy) đã lọc, nhưng nội dung gốc là của model → app không tin, kiểm lần nữa:
//   - chỉ loại đã biết; tối đa 12 khối, 6 ảnh, 4 link, 3 nút, 1 khối gợi ý (1–4 câu);
//   - ảnh: https tuyệt đối, hoặc objectKey công khai (không vùng nhạy cảm: CCCD, khuôn mặt, ảnh chat…);
//   - link: http(s);
//   - nút mở màn: route trong danh mục mà người dùng này mở được (assistant-routes) — không thì bỏ;
//   - nút thao tác (tool): phải có prompt + confirm — bấm chỉ hỏi lại rồi GỬI prompt như tin nhắn,
//     không bao giờ tự chạy gì.
// ----------------------------------------------------------------------

export type UiImageBlock = { type: 'image'; url?: string; objectKey?: string; alt?: string };
export type UiLinkBlock = { type: 'link'; url: string; title: string; host: string };
export type UiNavigateAction = { type: 'action'; kind: 'navigate'; id: string; label: string; href: string };
export type UiToolAction = {
  type: 'action';
  kind: 'tool';
  id: string;
  label: string;
  prompt: string;
  confirm: { title: string; message: string };
};
export type UiSuggestion = { label: string; prompt: string };
export type UiSuggestionsBlock = { type: 'suggestions'; items: UiSuggestion[] };

export type UiBlock = UiImageBlock | UiLinkBlock | UiNavigateAction | UiToolAction | UiSuggestionsBlock;

export const BLOCK_LIMITS = { total: 12, image: 6, link: 4, action: 3, suggestions: 1, suggestionItems: 4 } as const;

const OBJECT_KEY = /^[A-Za-z0-9/_.-]{1,256}$/;
// Vùng lưu trữ nhạy cảm / riêng tư — model không được trỏ ảnh tới đây.
const PRIVATE_PREFIXES = ['id-cards/', 'face-enrollment/', 'assistant/', 'messenger/', 't/'];

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** objectKey ảnh công khai hiển thị được. */
export function isPublicObjectKey(key: string): boolean {
  return (
    OBJECT_KEY.test(key) &&
    !key.includes('..') &&
    !key.startsWith('/') &&
    !PRIVATE_PREFIXES.some((p) => key.toLowerCase().startsWith(p))
  );
}

function imageBlock(b: Record<string, unknown>): UiImageBlock | null {
  const url = str(b.url);
  const objectKey = str(b.objectKey);
  const alt = str(b.alt).slice(0, 120) || undefined;
  if (url && objectKey) return null; // đúng một trong hai
  if (url) return parseHttpUrl(url)?.scheme === 'https' ? { type: 'image', url, alt } : null;
  if (objectKey) return isPublicObjectKey(objectKey) ? { type: 'image', objectKey, alt } : null;
  return null;
}

function linkBlock(b: Record<string, unknown>): UiLinkBlock | null {
  const url = str(b.url);
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  return { type: 'link', url, host: parsed.host, title: str(b.title).slice(0, 80) || parsed.host };
}

function actionBlock(b: Record<string, unknown>, user: AuthUser | null | undefined, id: string): UiNavigateAction | UiToolAction | null {
  const label = str(b.label);
  if (!label || label.length > 40) return null;
  if (b.kind === 'navigate') {
    const href = resolveRoute(str(b.route), b.params ?? undefined, user);
    return href ? { type: 'action', kind: 'navigate', id, label, href } : null;
  }
  if (b.kind === 'tool') {
    const prompt = str(b.prompt);
    if (!prompt || prompt.length > 300 || !isObj(b.confirm)) return null;
    return {
      type: 'action',
      kind: 'tool',
      id,
      label,
      prompt,
      confirm: {
        title: str(b.confirm.title).slice(0, 60) || label,
        message: str(b.confirm.message).slice(0, 300) || prompt,
      },
    };
  }
  return null;
}

function suggestionsBlock(b: Record<string, unknown>): UiSuggestionsBlock | null {
  if (!Array.isArray(b.items)) return null;
  const seen = new Set<string>();
  const items: UiSuggestion[] = [];
  for (const raw of b.items) {
    if (!isObj(raw)) continue;
    const label = str(raw.label).slice(0, 60);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    items.push({ label, prompt: str(raw.prompt).slice(0, 200) || label });
    if (items.length >= BLOCK_LIMITS.suggestionItems) break;
  }
  return items.length ? { type: 'suggestions', items } : null;
}

/** Khối thô (server / lịch sử) → khối hiển thị được cho người dùng này. Không phải mảng → []. */
export function normalizeBlocks(raw: unknown, user: AuthUser | null | undefined): UiBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: UiBlock[] = [];
  const count = { image: 0, link: 0, action: 0, suggestions: 0 };
  // Model hay lặp cùng một link → một thẻ (url cũng là key khi vẽ).
  const linkUrls = new Set<string>();
  for (const b of raw) {
    if (out.length >= BLOCK_LIMITS.total) break;
    if (!isObj(b)) continue;
    switch (b.type) {
      case 'image': {
        if (count.image >= BLOCK_LIMITS.image) break;
        const block = imageBlock(b);
        if (block) {
          out.push(block);
          count.image++;
        }
        break;
      }
      case 'link': {
        if (count.link >= BLOCK_LIMITS.link) break;
        const block = linkBlock(b);
        if (block && !linkUrls.has(block.url)) {
          linkUrls.add(block.url);
          out.push(block);
          count.link++;
        }
        break;
      }
      case 'action': {
        if (count.action >= BLOCK_LIMITS.action) break;
        const block = actionBlock(b, user, str(b.id) || `a${count.action + 1}`);
        if (block) {
          out.push(block);
          count.action++;
        }
        break;
      }
      case 'suggestions': {
        if (count.suggestions >= BLOCK_LIMITS.suggestions) break;
        const block = suggestionsBlock(b);
        if (block) {
          out.push(block);
          count.suggestions++;
        }
        break;
      }
      default:
        break; // loại lạ → bỏ
    }
  }
  return out;
}

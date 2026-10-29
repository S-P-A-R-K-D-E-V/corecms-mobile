import type { ISignContractRequest, SignatureStroke } from 'src/types/hr';

// ----------------------------------------------------------------------
// Nét vẽ chữ ký (phần thuần, test được): ghi điểm theo ngón tay trong khung ký, vẽ thành SVG path, đóng gói gửi core-be.
// core-be nhận ≤ 100 nét, ≤ 5000 điểm, toạ độ trong 0..width / 0..height rồi tự dựng SVG chữ ký.
// ----------------------------------------------------------------------

export const MAX_STROKES = 100;
export const MAX_POINTS = 5000;
/** Bỏ điểm sát điểm trước (px) — ngón tay đứng yên vẫn bắn sự kiện move. */
const MIN_STEP = 1.5;

const round = (v: number) => Math.round(v * 10) / 10;

export function pointCount(strokes: SignatureStroke[]): number {
  return strokes.reduce((n, s) => n + s.length, 0);
}

/** Bắt đầu nét mới tại một điểm (hết chỗ thì giữ nguyên). */
export function startStroke(strokes: SignatureStroke[], x: number, y: number): SignatureStroke[] {
  if (strokes.length >= MAX_STROKES || pointCount(strokes) >= MAX_POINTS) return strokes;
  return [...strokes, [[round(x), round(y)]]];
}

/** Thêm điểm vào nét đang vẽ (nét cuối); bỏ điểm quá sát điểm trước. */
export function extendStroke(strokes: SignatureStroke[], x: number, y: number): SignatureStroke[] {
  const last = strokes[strokes.length - 1];
  if (!last || pointCount(strokes) >= MAX_POINTS) return strokes;
  const [px, py] = last[last.length - 1];
  if (Math.hypot(x - px, y - py) < MIN_STEP) return strokes;
  return [...strokes.slice(0, -1), [...last, [round(x), round(y)]]];
}

/** SVG path của một nét; nét một điểm vẽ thành chấm. */
export function strokePath(stroke: SignatureStroke): string {
  if (stroke.length === 0) return '';
  const [[x0, y0], ...rest] = stroke;
  if (rest.length === 0) return `M ${x0} ${y0} l 0.1 0.1`;
  return `M ${x0} ${y0} ${rest.map(([x, y]) => `L ${x} ${y}`).join(' ')}`;
}

/** Đủ để gửi: có ít nhất một nét dài (không chỉ chấm vô tình). */
export function hasSignature(strokes: SignatureStroke[]): boolean {
  return strokes.some((s) => s.length >= 3);
}

/** Dữ liệu gửi `POST employment-contracts/{id}/sign`: toạ độ kẹp trong khung, bỏ nét rỗng, khung làm tròn. */
export function signPayload(strokes: SignatureStroke[], width: number, height: number): ISignContractRequest {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  return {
    strokes: strokes
      .filter((s) => s.length > 0)
      .slice(0, MAX_STROKES)
      .map((s) => s.map(([x, y]) => [clamp(x, w), clamp(y, h)] as [number, number])),
    width: w,
    height: h,
    agree: true,
  };
}

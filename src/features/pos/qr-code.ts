import { create } from 'qrcode/lib/core/qrcode';

// ----------------------------------------------------------------------
// Vẽ mã QR từ chuỗi EMVCo (qrPayload) khi máy chủ không trả ảnh (qrDataUrl): ma trận điểm từ gói `qrcode` (thuần JS),
// màn quầy vẽ bằng react-native-svg (qrSvgPath), màn hình khách nhận ảnh BMP 1-bit dạng data URL (module native
// customer-display giải mã data:image;base64 bằng BitmapFactory).
// ----------------------------------------------------------------------

export type QrMatrix = { size: number; dark: (x: number, y: number) => boolean };

/** Lề trắng quanh mã (số ô) — chuẩn QR cần 4. */
export const QR_QUIET_ZONE = 4;

function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

/** Ma trận điểm của mã; chuỗi rỗng / quá dài → null. */
export function qrMatrix(text: string | null | undefined): QrMatrix | null {
  if (!text) return null;
  try {
    // Gói `qrcode` mã hoá chữ bằng TextEncoder (RN ≥ 0.75 có sẵn); thiếu thì tự mã hoá UTF-8, cả chuỗi một khối byte.
    const input = typeof TextEncoder === 'undefined' ? [{ data: utf8(text), mode: 'byte' as const }] : text;
    const { size, data } = create(input, { errorCorrectionLevel: 'M' }).modules;
    return { size, dark: (x, y) => x >= 0 && y >= 0 && x < size && y < size && !!data[y * size + x] };
  } catch {
    return null;
  }
}

/** Đường SVG các ô tối (gộp ô liền nhau theo hàng), toạ độ tính cả lề — viewBox 0 0 (size + 2·lề). */
export function qrSvgPath(matrix: QrMatrix, margin = QR_QUIET_ZONE): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    let x = 0;
    while (x < matrix.size) {
      if (!matrix.dark(x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x < matrix.size && matrix.dark(x, y)) x++;
      const run = x - start;
      parts.push(`M${start + margin} ${y + margin}h${run}v1h-${run}z`);
    }
  }
  return parts.join('');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out +=
      B64[(n >> 18) & 63] +
      B64[(n >> 12) & 63] +
      (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') +
      (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}

/** Ảnh BMP 1-bit (đen / trắng) của mã, mỗi ô `scale` điểm ảnh, kèm lề — cỡ vài chục KB. */
export function qrBmp(matrix: QrMatrix, scale = 8, margin = QR_QUIET_ZONE): Uint8Array {
  const dim = (matrix.size + margin * 2) * scale;
  const stride = Math.ceil(dim / 32) * 4;
  const offset = 14 + 40 + 8;
  const bytes = new Uint8Array(offset + stride * dim);
  const view = new DataView(bytes.buffer);
  // BITMAPFILEHEADER
  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, offset, true);
  // BITMAPINFOHEADER: dim × dim, 1 mặt, 1 bit/điểm, không nén, bảng 2 màu
  view.setUint32(14, 40, true);
  view.setInt32(18, dim, true);
  view.setInt32(22, dim, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 1, true);
  view.setUint32(34, stride * dim, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 2, true);
  // Bảng màu (B, G, R, 0): 0 = trắng, 1 = đen
  bytes.set([255, 255, 255, 0, 0, 0, 0, 0], 54);
  for (let row = 0; row < dim; row++) {
    // BMP lưu hàng từ dưới lên.
    const y = Math.floor((dim - 1 - row) / scale) - margin;
    const base = offset + row * stride;
    for (let px = 0; px < dim; px++) {
      if (matrix.dark(Math.floor(px / scale) - margin, y)) bytes[base + (px >> 3)] |= 0x80 >> (px & 7);
    }
  }
  return bytes;
}

/** data:image/bmp;base64 của mã cho màn hình khách; không vẽ được → null. */
export function qrImageDataUrl(text: string | null | undefined): string | null {
  const matrix = qrMatrix(text);
  return matrix ? `data:image/bmp;base64,${base64(qrBmp(matrix))}` : null;
}

import { base64, qrBmp, qrImageDataUrl, qrMatrix, qrSvgPath, QR_QUIET_ZONE } from '../qr-code';

// Vẽ mã QR từ chuỗi EMVCo khi máy chủ không trả ảnh: ma trận (gói qrcode), đường SVG cho màn quầy, ảnh BMP cho màn khách.

const PAYLOAD =
  '00020101021238570010A00000072701270006970422011397042299990208QRIBFTTA53037045405700005802VN62130809SPABC23456304ABCD';

/** Ô tối của mẫu định vị góc trên trái (7×7: viền + lõi 3×3). */
const finderDark = (x: number, y: number) =>
  x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4);

describe('qrMatrix', () => {
  it('ma trận vuông, có mẫu định vị ở góc; ngoài ma trận là sáng', () => {
    const m = qrMatrix(PAYLOAD)!;
    expect(m.size).toBeGreaterThanOrEqual(21);
    expect((m.size - 17) % 4).toBe(0);
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) expect(m.dark(x, y)).toBe(finderDark(x, y));
    expect(m.dark(-1, 0)).toBe(false);
    expect(m.dark(m.size, 0)).toBe(false);
  });

  it('rỗng → null', () => {
    expect(qrMatrix('')).toBeNull();
    expect(qrMatrix(null)).toBeNull();
    expect(qrMatrix(undefined)).toBeNull();
  });

  it('máy không có TextEncoder vẫn vẽ được (tự mã hoá UTF-8)', () => {
    const original = (globalThis as any).TextEncoder;
    try {
      delete (globalThis as any).TextEncoder;
      const m = qrMatrix(PAYLOAD)!;
      expect(m).not.toBeNull();
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) expect(m.dark(x, y)).toBe(finderDark(x, y));
      expect(qrMatrix('Bàn 1 · cà phê')).not.toBeNull();
    } finally {
      (globalThis as any).TextEncoder = original;
    }
  });
});

describe('qrSvgPath', () => {
  it('gộp ô tối liền nhau theo hàng, dời theo lề', () => {
    // Ma trận 3×1: tối, tối, sáng.
    const m = { size: 3, dark: (x: number, y: number) => y === 0 && x < 2 };
    expect(qrSvgPath(m, 4)).toBe('M4 4h2v1h-2z');
    // Hàng đầu của mẫu định vị: 7 ô tối liền nhau.
    expect(qrSvgPath(qrMatrix(PAYLOAD)!).startsWith(`M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h7v1h-7z`)).toBe(true);
  });
});

describe('ảnh BMP cho màn hình khách', () => {
  it('base64 giống Buffer', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 100]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(base64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });

  it('tiêu đề BMP 1-bit + điểm ảnh khớp ma trận (hàng lưu từ dưới lên)', () => {
    const m = qrMatrix(PAYLOAD)!;
    const scale = 2;
    const margin = 4;
    const bytes = qrBmp(m, scale, margin);
    const view = new DataView(bytes.buffer);
    const dim = (m.size + margin * 2) * scale;
    const stride = Math.ceil(dim / 32) * 4;
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('BM');
    expect(view.getUint32(2, true)).toBe(bytes.length);
    expect(view.getUint32(10, true)).toBe(62);
    expect(view.getInt32(18, true)).toBe(dim);
    expect(view.getInt32(22, true)).toBe(dim);
    expect(view.getUint16(28, true)).toBe(1);
    expect(bytes.length).toBe(62 + stride * dim);
    const pixel = (px: number, py: number) => {
      const row = dim - 1 - py;
      return (bytes[62 + row * stride + (px >> 3)] & (0x80 >> (px & 7))) !== 0;
    };
    for (let py = 0; py < dim; py++) {
      for (let px = 0; px < dim; px++) {
        expect(pixel(px, py)).toBe(m.dark(Math.floor(px / scale) - margin, Math.floor(py / scale) - margin));
      }
    }
  });

  it('data URL; không vẽ được → null', () => {
    expect(qrImageDataUrl(PAYLOAD)).toMatch(/^data:image\/bmp;base64,Qk/);
    expect(qrImageDataUrl(null)).toBeNull();
  });
});

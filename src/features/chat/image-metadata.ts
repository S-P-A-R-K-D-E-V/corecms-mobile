// ----------------------------------------------------------------------
// Xoá vị trí (GPS) trong ảnh JPEG mà không giải mã ảnh — phần thuần, để test được.
// Chỉ là đường lùi khi máy KHÔNG vẽ lại được ảnh (bản app cũ chưa có expo-image-manipulator, hoặc vẽ lại lỗi):
// bình thường ảnh được vẽ lại + nén nên mọi EXIF/GPS đã mất (attachment-prepare). Không có đường lùi này thì
// Android vẫn gửi GPS: picker nén ảnh (quality < 1) nhưng chép lại EXIF gốc vào tệp mới.
// Sửa tại chỗ, KHÔNG đổi độ dài tệp, không đụng dữ liệu ảnh (sau SOS):
//   - EXIF (APP1 "Exif\0\0"): xoá trắng thư mục GPS (mọi mục + giá trị), giữ các thẻ khác (hướng xoay…).
//     EXIF hỏng / không đọc được → xoá trắng cả đoạn (an toàn trước, có thể mất hướng xoay).
//   - APP1 khác (XMP, XMP mở rộng) và APP13 (IPTC/Photoshop): có thể chứa toạ độ / địa danh → ghi đè khoảng trắng.
// ----------------------------------------------------------------------

/** Số byte mỗi giá trị theo kiểu TIFF (BYTE, ASCII, SHORT, LONG, RATIONAL, SBYTE, UNDEFINED, SSHORT, SLONG, SRATIONAL, FLOAT, DOUBLE). */
const TIFF_TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const GPS_IFD_TAG = 0x8825;
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
const BLANK = 0x20;

export type JpegScrubResult = {
  /** Có sửa byte nào không (false = không có gì để xoá, bytes giữ nguyên). */
  changed: boolean;
  /** Đã duyệt hết phần metadata (tới SOS/EOI). false = bộ đệm chỉ là phần đầu tệp / tệp hỏng → chưa chắc sạch. */
  complete: boolean;
};

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Ghi `value` vào [from, to); trả về true nếu có byte thật sự đổi. */
function fill(bytes: Uint8Array, from: number, to: number, value: number): boolean {
  let changed = false;
  for (let i = from; i < to; i++) {
    if (bytes[i] !== value) {
      bytes[i] = value;
      changed = true;
    }
  }
  return changed;
}

function startsWith(bytes: Uint8Array, at: number, prefix: readonly number[]): boolean {
  return prefix.every((b, i) => bytes[at + i] === b);
}

/**
 * Xoá thư mục GPS trong khối TIFF của EXIF ([start, end) trong bytes). Trả về: true = đã xoá, false = không có GPS,
 * null = khối hỏng / không đọc chắc được (người gọi xoá trắng cả đoạn).
 */
function scrubTiffGps(bytes: Uint8Array, start: number, end: number): boolean | null {
  const len = end - start;
  if (len < 8) return null;
  const order = String.fromCharCode(bytes[start]!, bytes[start + 1]!);
  if (order !== 'II' && order !== 'MM') return null;
  const le = order === 'II';
  const at = (o: number) => bytes[start + o]!;
  const u16 = (o: number) => (le ? at(o) | (at(o + 1) << 8) : (at(o) << 8) | at(o + 1));
  const u32 = (o: number) =>
    (le ? at(o) | (at(o + 1) << 8) | (at(o + 2) << 16) | (at(o + 3) << 24) : (at(o) << 24) | (at(o + 1) << 16) | (at(o + 2) << 8) | at(o + 3)) >>> 0;
  const inside = (o: number, size: number) => o >= 0 && size >= 0 && o + size <= len;

  if (u16(2) !== 42) return null;
  const ifd0 = u32(4);
  if (!inside(ifd0, 2)) return null;
  const n0 = u16(ifd0);
  if (!inside(ifd0 + 2, n0 * 12)) return null;

  let gps = -1;
  for (let k = 0; k < n0; k++) {
    const entry = ifd0 + 2 + k * 12;
    if (u16(entry) === GPS_IFD_TAG) {
      gps = u32(entry + 8);
      break;
    }
  }
  if (gps < 0) return false;
  if (!inside(gps, 2)) return null;
  const n = u16(gps);
  if (!inside(gps + 2, n * 12)) return null;

  let changed = false;
  for (let k = 0; k < n; k++) {
    const entry = gps + 2 + k * 12;
    const typeSize = TIFF_TYPE_SIZE[u16(entry + 2)];
    if (typeSize === undefined) return null; // kiểu lạ → không biết giá trị nằm đâu
    const size = typeSize * u32(entry + 4);
    if (size > 4) {
      // Giá trị > 4 byte nằm ngoài mục (offset trong khối TIFF), vd. toạ độ RATIONAL × 3.
      const offset = u32(entry + 8);
      if (!inside(offset, size)) return null;
      changed = fill(bytes, start + offset, start + offset + size, 0) || changed;
    }
  }
  // Xoá các mục (giá trị ≤ 4 byte nằm ngay trong mục) và số mục = 0: thư mục GPS rỗng, vẫn hợp lệ.
  changed = fill(bytes, start + gps, start + gps + 2 + n * 12, 0) || changed;
  return changed;
}

/**
 * Xoá vị trí trong JPEG (sửa thẳng trên `bytes`). Chạy được trên phần đầu tệp: `complete` cho biết đã duyệt tới
 * dữ liệu ảnh chưa — chưa (metadata dài hơn bộ đệm / tệp hỏng) thì phải chạy lại trên cả tệp.
 */
export function scrubJpegLocation(bytes: Uint8Array): JpegScrubResult {
  if (!isJpeg(bytes)) return { changed: false, complete: false };
  let changed = false;
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) return { changed, complete: false }; // lệch cấu trúc — tệp hỏng
    const marker = bytes[i + 1]!;
    if (marker === 0xff) {
      i += 1; // byte đệm giữa các đoạn
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return { changed, complete: true }; // SOS / EOI: hết metadata
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // đoạn không có độ dài
      continue;
    }
    if (i + 3 >= bytes.length) break;
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    const start = i + 4;
    const end = i + 2 + length;
    if (length < 2 || end > bytes.length) break; // đoạn vượt quá bộ đệm
    if (marker === 0xe1) {
      if (end - start >= EXIF_HEADER.length && startsWith(bytes, start, EXIF_HEADER)) {
        const gps = scrubTiffGps(bytes, start + EXIF_HEADER.length, end);
        if (gps === null) changed = fill(bytes, start, end, BLANK) || changed;
        else changed = gps || changed;
      } else {
        changed = fill(bytes, start, end, BLANK) || changed; // XMP / XMP mở rộng
      }
    } else if (marker === 0xed) {
      changed = fill(bytes, start, end, BLANK) || changed; // IPTC / Photoshop
    }
    i = end;
  }
  return { changed, complete: false };
}

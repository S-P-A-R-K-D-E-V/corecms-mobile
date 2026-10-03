import { isJpeg, scrubJpegLocation } from '../image-metadata';

// ----------------------------------------------------------------------
// Ảnh gửi đi (chat, trợ lý, minh chứng vệ sinh) không được mang vị trí: bình thường vẽ lại (bỏ hết EXIF);
// bản app chưa có bộ nén thì xoá GPS/XMP trên bytes JPEG.
// ----------------------------------------------------------------------

const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

/** Khối TIFF của EXIF: IFD0 {Orientation = 6, con trỏ GPS}, IFD GPS {LatitudeRef "N", Latitude 21/1 1/1 30/1}. */
function tiff(le: boolean, opts: { gps?: boolean; gpsType?: number } = {}): number[] {
  const t = new Array<number>(92).fill(0);
  const w16 = (o: number, v: number) => {
    t[o + (le ? 0 : 1)] = v & 0xff;
    t[o + (le ? 1 : 0)] = (v >> 8) & 0xff;
  };
  const w32 = (o: number, v: number) => {
    for (let k = 0; k < 4; k++) t[o + (le ? k : 3 - k)] = (v >>> (8 * k)) & 0xff;
  };
  const entry = (o: number, tag: number, type: number, count: number) => {
    w16(o, tag);
    w16(o + 2, type);
    w32(o + 4, count);
  };
  t[0] = t[1] = le ? 0x49 : 0x4d;
  w16(2, 42);
  w32(4, 8);
  w16(8, opts.gps === false ? 1 : 2); // không có GPS: IFD0 chỉ còn mục Orientation
  entry(10, 0x0112, 3, 1);
  w16(18, 6);
  entry(22, 0x8825, 4, 1);
  w32(30, 38);
  w32(34, 0);
  w16(38, 2);
  entry(40, 0x0001, 2, 2);
  t[48] = 0x4e; // "N"
  entry(52, 0x0002, opts.gpsType ?? 5, 3);
  w32(60, 68);
  w32(64, 0);
  [21, 1, 1, 1, 30, 1].forEach((v, k) => w32(68 + k * 4, v));
  return t;
}

const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const XMP = ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta exif:GPSLatitude="21,1.5N" exif:GPSLongitude="105,51E"/>');
const IPTC = ascii('Photoshop 3.0\u00008BIM\x04\x04 Ha Noi');
const IMAGE_DATA = [0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0x12, 0x34, 0x56, 0xff, 0xd9];

function jpeg(opts: { le?: boolean; gps?: boolean; xmp?: boolean; iptc?: boolean; gpsType?: number; exif?: number[] } = {}): Uint8Array {
  const { le = true, xmp = true, iptc = false } = opts;
  return Uint8Array.from([
    0xff, 0xd8,
    ...segment(0xe0, ascii('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')),
    ...segment(0xe1, opts.exif ?? [...ascii('Exif\0\0'), ...tiff(le, opts)]),
    ...(xmp ? segment(0xe1, XMP) : []),
    ...(iptc ? segment(0xed, IPTC) : []),
    ...segment(0xe2, ascii('ICC_PROFILE\0giu nguyen')),
    ...IMAGE_DATA,
  ]);
}

function indexOf(bytes: Uint8Array, needle: number[]): number {
  for (let i = 0; i + needle.length <= bytes.length; i++) if (needle.every((b, k) => bytes[i + k] === b)) return i;
  return -1;
}

/** Đọc lại EXIF đã xoá: hướng xoay, số mục GPS, toạ độ. */
function readExif(bytes: Uint8Array, le = true) {
  const t = indexOf(bytes, ascii('Exif\0\0')) + 6;
  const u16 = (o: number) => (le ? bytes[t + o]! | (bytes[t + o + 1]! << 8) : (bytes[t + o]! << 8) | bytes[t + o + 1]!);
  return {
    orientation: u16(18),
    gpsEntries: u16(38),
    gpsTail: Array.from(bytes.slice(t + 40, t + 92)),
  };
}

describe('xoá vị trí trong JPEG (đường lùi khi không vẽ lại được ảnh)', () => {
  it.each([
    ['little-endian (Android)', true],
    ['big-endian', false],
  ])('%s: xoá trắng thư mục GPS, giữ hướng xoay, XMP thành khoảng trắng, dữ liệu ảnh nguyên vẹn', (_label, le) => {
    const bytes = jpeg({ le });
    const before = Uint8Array.from(bytes);
    expect(readExif(bytes, le)).toMatchObject({ orientation: 6, gpsEntries: 2 });

    expect(scrubJpegLocation(bytes)).toEqual({ changed: true, complete: true });

    const exif = readExif(bytes, le);
    expect(exif.orientation).toBe(6);
    expect(exif.gpsEntries).toBe(0);
    expect(exif.gpsTail.every((b) => b === 0)).toBe(true); // "N" + 21°1'30" không còn
    expect(bytes.length).toBe(before.length);
    expect(indexOf(bytes, ascii('GPSLatitude'))).toBe(-1);
    expect(indexOf(bytes, ascii('ns.adobe.com'))).toBe(-1);
    // ICC + dữ liệu ảnh (từ SOS) không đổi.
    expect(indexOf(bytes, ascii('ICC_PROFILE\0giu nguyen'))).toBeGreaterThan(0);
    expect(Array.from(bytes.slice(-IMAGE_DATA.length))).toEqual(IMAGE_DATA);
    expect(isJpeg(bytes)).toBe(true);
  });

  it('IPTC / Photoshop (địa danh) cũng bị xoá', () => {
    const bytes = jpeg({ iptc: true });
    expect(scrubJpegLocation(bytes).changed).toBe(true);
    expect(indexOf(bytes, ascii('Ha Noi'))).toBe(-1);
  });

  it('không có GPS / XMP → không đổi byte nào; chạy lại lần hai cũng không đổi gì', () => {
    const clean = jpeg({ gps: false, xmp: false });
    const copy = Uint8Array.from(clean);
    expect(scrubJpegLocation(clean)).toEqual({ changed: false, complete: true });
    expect(Array.from(clean)).toEqual(Array.from(copy));

    const dirty = jpeg();
    scrubJpegLocation(dirty);
    const once = Array.from(dirty);
    expect(scrubJpegLocation(dirty)).toEqual({ changed: false, complete: true });
    expect(Array.from(dirty)).toEqual(once);
  });

  it('EXIF hỏng hoặc GPS có kiểu lạ → xoá trắng cả đoạn EXIF (an toàn trước)', () => {
    const broken = jpeg({ exif: [...ascii('Exif\0\0'), 0x49, 0x49, 0x00, 0x00, 1, 2, 3, 4] });
    expect(scrubJpegLocation(broken).changed).toBe(true);
    expect(indexOf(broken, ascii('Exif'))).toBe(-1);

    const oddType = jpeg({ gpsType: 99 });
    expect(scrubJpegLocation(oddType).changed).toBe(true);
    expect(indexOf(oddType, ascii('Exif'))).toBe(-1);
  });

  it('chỉ có phần đầu tệp (đoạn bị cắt) → complete = false để đọc lại cả tệp', () => {
    const full = jpeg();
    const head = full.slice(0, indexOf(full, ascii('Exif')) + 20);
    expect(scrubJpegLocation(head).complete).toBe(false);
  });

  it('không phải JPEG → không đụng tới', () => {
    const png = Uint8Array.from([0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(scrubJpegLocation(png)).toEqual({ changed: false, complete: false });
    expect(isJpeg(png)).toBe(false);
  });
});

// ----------------------------------------------------------------------
// prepareAttachment: luôn vẽ lại ảnh tĩnh khi có bộ nén; không có thì JPEG vẫn bị xoá vị trí trước khi gửi.

type PrepareModule = typeof import('../attachment-prepare');

const files = new Map<string, Uint8Array>();

function loadPrepare(opts: { manipulator: boolean }) {
  jest.resetModules();
  jest.doMock('expo', () => ({ requireOptionalNativeModule: () => (opts.manipulator ? {} : null) }));
  jest.doMock('expo-file-system/legacy', () => ({
    EncodingType: { Base64: 'base64' },
    cacheDirectory: 'file:///cache/',
    readAsStringAsync: jest.fn(async (uri: string, o?: { position?: number; length?: number }) => {
      const b = files.get(uri);
      if (!b) throw new Error(`không có ${uri}`);
      const start = o?.position ?? 0;
      return Buffer.from(b.subarray(start, o?.length !== undefined ? start + o.length : b.length)).toString('base64');
    }),
    writeAsStringAsync: jest.fn(async (uri: string, data: string) => {
      files.set(uri, Uint8Array.from(Buffer.from(data, 'base64')));
    }),
    getInfoAsync: jest.fn(async (uri: string) => ({ exists: files.has(uri), size: files.get(uri)?.length })),
  }));
  const saveAsync = jest.fn(async (o: { format: string; compress: number }) => {
    const uri = `file:///cache/ve-lai.${o.format}`;
    files.set(uri, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));
    return { uri, width: 1280, height: 960 };
  });
  const rendered = { width: 1280, height: 960, saveAsync, release: jest.fn() };
  jest.doMock('expo-image-manipulator', () => ({
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
    ImageManipulator: { manipulate: jest.fn(() => ({ renderAsync: async () => rendered, resize: jest.fn(), release: jest.fn() })) },
  }));
  // eslint-disable-next-line global-require
  return { mod: require('../attachment-prepare') as PrepareModule, saveAsync };
}

describe('prepareAttachment — ảnh gửi đi không mang EXIF/GPS', () => {
  beforeEach(() => files.clear());
  afterAll(() => {
    jest.dontMock('expo');
    jest.dontMock('expo-file-system/legacy');
    jest.dontMock('expo-image-manipulator');
  });

  it('có bộ nén: JPEG nhỏ (1280px, 300 KB) vẫn được vẽ lại thành JPEG 0.7', async () => {
    const { mod, saveAsync } = loadPrepare({ manipulator: true });
    files.set('file:///anh.jpg', jpeg());
    const out = await mod.prepareAttachment({ uri: 'file:///anh.jpg', name: 'IMG_1.jpg', mimeType: 'image/jpeg', size: 300_000, width: 1280, height: 960, source: 'image' });
    expect(saveAsync).toHaveBeenCalledWith({ compress: 0.7, format: 'jpeg' });
    expect(out).toMatchObject({ uri: 'file:///cache/ve-lai.jpeg', contentType: 'image/jpeg', name: 'IMG_1.jpg', size: 4, kind: 'image' });
  });

  it('không có bộ nén: JPEG có GPS → ghi bản đã xoá vị trí ra tệp mới, tệp gốc giữ nguyên', async () => {
    const { mod } = loadPrepare({ manipulator: false });
    const original = jpeg();
    files.set('file:///anh.jpg', Uint8Array.from(original));
    const out = await mod.prepareAttachment({ uri: 'file:///anh.jpg', name: 'IMG_1.jpg', mimeType: 'image/jpeg', size: original.length, source: 'image' });
    expect(out.uri).toMatch(/^file:\/\/\/cache\/anh_sach_\d+_\d+\.jpg$/);
    expect(out.contentType).toBe('image/jpeg');
    const sent = files.get(out.uri)!;
    expect(sent.length).toBe(original.length);
    expect(readExif(sent)).toMatchObject({ orientation: 6, gpsEntries: 0 });
    expect(indexOf(sent, ascii('GPSLatitude'))).toBe(-1);
    expect(Array.from(files.get('file:///anh.jpg')!)).toEqual(Array.from(original));
  });

  it('không có bộ nén: JPEG sạch gửi nguyên tệp; không đọc được tệp → báo lỗi (không gửi liều)', async () => {
    const { mod } = loadPrepare({ manipulator: false });
    files.set('file:///sach.jpg', jpeg({ gps: false, xmp: false }));
    const out = await mod.prepareAttachment({ uri: 'file:///sach.jpg', mimeType: 'image/jpeg', size: 10, source: 'image' });
    expect(out.uri).toBe('file:///sach.jpg');

    await expect(mod.prepareAttachment({ uri: 'file:///mat.jpg', mimeType: 'image/jpeg', size: 10, source: 'image' })).rejects.toThrow();
  });

  it('tài liệu không bị đụng tới', async () => {
    const { mod, saveAsync } = loadPrepare({ manipulator: true });
    files.set('file:///bao-cao.pdf', Uint8Array.from(ascii('%PDF-1.7')));
    const out = await mod.prepareAttachment({ uri: 'file:///bao-cao.pdf', name: 'bao-cao.pdf', mimeType: 'application/pdf', size: 8, source: 'document' });
    expect(saveAsync).not.toHaveBeenCalled();
    expect(out).toMatchObject({ uri: 'file:///bao-cao.pdf', contentType: 'application/pdf', kind: 'file' });
  });
});

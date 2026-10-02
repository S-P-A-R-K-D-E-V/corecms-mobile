import { HttpStatusError } from 'src/api/http-status-error';
import {
  MB,
  base64ToBytes,
  batchProgress,
  describeUploadError,
  fileNameFor,
  fitWithin,
  formatBytes,
  normalizeMime,
  planImageProcessing,
  resolveContentType,
  runPool,
  serverMessageOf,
  sniffContentType,
  validateAttachments,
  withRetry,
} from '../attachment-rules';

const bytes = (...xs: (number | string)[]) =>
  Uint8Array.from(xs.flatMap((x) => (typeof x === 'string' ? Array.from(x).map((c) => c.charCodeAt(0)) : [x])));

describe('loại tệp', () => {
  it('chuẩn hoá content-type (bí danh, tham số, hoa thường)', () => {
    expect(normalizeMime('image/JPG')).toBe('image/jpeg');
    expect(normalizeMime('text/comma-separated-values; charset=utf-8')).toBe('text/csv');
    expect(normalizeMime('')).toBeNull();
    expect(normalizeMime(null)).toBeNull();
  });

  it('ảnh tin content-type của picker, tài liệu ưu tiên đuôi tệp', () => {
    // iOS chế độ Compatible: tên vẫn .HEIC nhưng nội dung đã là JPEG.
    expect(resolveContentType('IMG_0001.HEIC', 'image/jpeg')).toBe('image/jpeg');
    expect(resolveContentType('bao-cao.pdf', 'application/octet-stream')).toBe('application/pdf');
    expect(resolveContentType('so-lieu.csv', 'application/vnd.ms-excel')).toBe('text/csv');
    expect(resolveContentType('ghi-chu.txt', null)).toBe('text/plain');
    expect(resolveContentType('setup.exe', 'application/x-msdownload')).toBe('application/x-msdownload');
    expect(resolveContentType('khong-duoi', null)).toBeNull();
  });

  it('tên gửi kèm: đuôi khớp loại thật, bỏ đường dẫn, giới hạn 200 ký tự', () => {
    expect(fileNameFor('IMG_0001.HEIC', 'image/jpeg', 'anh')).toBe('IMG_0001.jpg');
    expect(fileNameFor('chup.jpeg', 'image/jpeg', 'anh')).toBe('chup.jpeg');
    expect(fileNameFor('../../etc/hop-dong.pdf', 'application/pdf', 'tep')).toBe('hop-dong.pdf');
    expect(fileNameFor(null, 'image/png', 'anh', 123)).toBe('anh_123.png');
    const long = fileNameFor(`${'a'.repeat(300)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'tep');
    expect(long).toHaveLength(200);
    expect(long.endsWith('.xlsx')).toBe(true);
  });

  it('nhận diện ảnh theo magic bytes', () => {
    expect(sniffContentType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffContentType(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffContentType(bytes('GIF89a'))).toBe('image/gif');
    expect(sniffContentType(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('image/webp');
    expect(sniffContentType(bytes(0, 0, 0, 0x18, 'ftypheic'))).toBe('image/heic');
    expect(sniffContentType(bytes(0, 0, 0, 0x1c, 'ftypavif'))).toBe('image/avif');
    expect(sniffContentType(bytes('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffContentType(bytes('hello'))).toBeNull();
    expect(sniffContentType(new Uint8Array())).toBeNull();
  });

  it('giải base64 phần đầu tệp', () => {
    expect(Array.from(base64ToBytes('iVBORw0KGgo='))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(Array.from(base64ToBytes('/9j/4AAQ'))).toEqual([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffContentType(base64ToBytes('/9j/4AAQSkZJRgABAQ=='))).toBe('image/jpeg');
  });

  it('định dạng dung lượng', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(734221)).toBe('717 KB');
    expect(formatBytes(10 * MB)).toBe('10 MB');
    expect(formatBytes(12.4 * MB)).toBe('12.4 MB');
  });
});

describe('xử lý ảnh trước khi gửi', () => {
  it('HEIC luôn chuyển JPEG; GIF giữ nguyên', () => {
    expect(planImageProcessing({ contentType: 'image/heic', width: 800, height: 600, size: 100_000 })).toMatchObject({ format: 'jpeg' });
    expect(planImageProcessing({ contentType: 'image/gif', width: 4000, height: 4000, size: 9 * MB })).toBeNull();
  });

  it('JPEG nhỏ gửi nguyên; lớn (cạnh dài / dung lượng) thì thu nhỏ + nén', () => {
    expect(planImageProcessing({ contentType: 'image/jpeg', width: 1280, height: 960, size: 400_000 })).toBeNull();
    expect(planImageProcessing({ contentType: 'image/jpeg', width: 4032, height: 3024, size: 900_000 })).toMatchObject({ format: 'jpeg', maxEdge: 2048 });
    expect(planImageProcessing({ contentType: 'image/jpeg', width: 1600, height: 1200, size: 2 * MB })).toMatchObject({ format: 'jpeg' });
  });

  it('ảnh chụp màn hình PNG giữ PNG khi thu nhỏ; PNG nặng thì sang JPEG', () => {
    expect(planImageProcessing({ contentType: 'image/png', width: 1179, height: 2556, size: 800_000 })).toMatchObject({ format: 'png' });
    expect(planImageProcessing({ contentType: 'image/png', width: 1000, height: 800, size: 300_000 })).toBeNull();
    expect(planImageProcessing({ contentType: 'image/png', width: 3000, height: 4000, size: 6 * MB })).toMatchObject({ format: 'jpeg' });
  });

  it('thu nhỏ giữ tỉ lệ, cạnh dài ≤ 2048', () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536, resized: true });
    expect(fitWithin(1179, 2556, 2048)).toEqual({ width: 945, height: 2048, resized: true });
    expect(fitWithin(1200, 900, 2048)).toEqual({ width: 1200, height: 900, resized: false });
    expect(fitWithin(0, 0, 2048)).toEqual({ width: 0, height: 0, resized: false });
  });
});

describe('kiểm tra trước khi xin URL', () => {
  const jpg = (size: number, name = 'a.jpg') => ({ name, contentType: 'image/jpeg', size });

  it('hợp lệ', () => {
    expect(validateAttachments([jpg(500_000), { name: 'b.pdf', contentType: 'application/pdf', size: 15 * MB }])).toBeNull();
  });

  it('quá 10 tệp', () => {
    expect(validateAttachments(Array.from({ length: 11 }, () => jpg(1000)))).toEqual({ code: 'too_many_files', max: 10 });
  });

  it('loại không nhận / HEIC chưa chuyển / tệp rỗng', () => {
    expect(validateAttachments([{ name: 'x.exe', contentType: 'application/x-msdownload', size: 10 }])).toEqual({ code: 'unsupported_type', name: 'x.exe' });
    expect(validateAttachments([{ name: 'IMG.HEIC', contentType: 'image/heic', size: 10 }])).toEqual({ code: 'needs_conversion', name: 'IMG.HEIC' });
    expect(validateAttachments([jpg(0, 'rong.jpg')])).toEqual({ code: 'empty_file', name: 'rong.jpg' });
  });

  it('giới hạn theo loại: ảnh 10 MB, PDF/Office 20 MB, TXT/CSV 5 MB', () => {
    expect(validateAttachments([jpg(11 * MB, 'to.jpg')])).toEqual({ code: 'attachment_too_large', name: 'to.jpg', size: 11 * MB, maxBytes: 10 * MB });
    expect(validateAttachments([{ name: 'a.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 19 * MB }])).toBeNull();
    expect(validateAttachments([{ name: 'a.csv', contentType: 'text/csv', size: 6 * MB }])).toMatchObject({ code: 'attachment_too_large', maxBytes: 5 * MB });
  });

  it('tổng một lần gửi ≤ 50 MB', () => {
    const pdf = { name: 'a.pdf', contentType: 'application/pdf', size: 18 * MB };
    expect(validateAttachments([pdf, pdf, pdf])).toMatchObject({ code: 'total_too_large', maxBytes: 50 * MB });
  });
});

describe('tiến độ / song song / thử lại', () => {
  it('phần trăm theo dung lượng, đếm tệp đã xong', () => {
    expect(
      batchProgress([
        { size: 300, progress: 1, uploaded: true },
        { size: 100, progress: 0.5, uploaded: false },
        { size: 600, progress: 0, uploaded: false },
      ])
    ).toEqual({ done: 1, total: 3, percent: 35 });
    expect(batchProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it('runPool: tối đa N việc cùng lúc, giữ thứ tự, một lỗi không chặn việc khác', async () => {
    let running = 0;
    let peak = 0;
    const results = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (n === 4) throw new Error('hỏng');
      return n * 10;
    });
    expect(peak).toBe(3);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : 'x'))).toEqual([10, 20, 30, 'x', 50, 60, 70]);
    expect(await runPool([], 3, async () => 1)).toEqual([]);
  });

  it('withRetry: thử lại lỗi tạm thời theo nhịp chờ, dừng khi lỗi không nên thử lại', async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        if (calls < 3) throw new Error('mạng');
        return 'ok';
      }, { sleep })
    ).resolves.toBe('ok');
    expect(waits).toEqual([800, 2000]);

    calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new HttpStatusError(400, {});
      }, { sleep, shouldRetry: () => false })
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);

    calls = 0;
    await expect(withRetry(async () => { calls++; throw new Error('x'); }, { sleep, retries: 1 })).rejects.toThrow('x');
    expect(calls).toBe(2);
  });
});

describe('lỗi → thông báo', () => {
  it('lấy câu báo lỗi của server', () => {
    expect(serverMessageOf({ error: 'Ảnh “a.jpg” nặng 12,4 MB — tối đa 10 MB.', code: 'attachment_too_large' })).toBe('Ảnh “a.jpg” nặng 12,4 MB — tối đa 10 MB.');
    expect(serverMessageOf({ title: 'One or more validation errors occurred.' })).toBe('One or more validation errors occurred.');
    expect(serverMessageOf('<html>413</html>')).toBeUndefined();
    expect(serverMessageOf('')).toBeUndefined();
  });

  it('xin URL', () => {
    expect(describeUploadError(new HttpStatusError(400, { error: 'Quá lớn' }), 'presign')).toEqual({ key: 'rejected', retryable: false, serverMessage: 'Quá lớn', status: 400 });
    expect(describeUploadError(new HttpStatusError(403, ''), 'presign')).toMatchObject({ key: 'forbidden', retryable: false });
    expect(describeUploadError(new HttpStatusError(404, ''), 'presign')).toMatchObject({ key: 'serverOutdated', retryable: false });
    expect(describeUploadError(new HttpStatusError(503, ''), 'presign')).toMatchObject({ key: 'failed', retryable: true });
    // Interceptor chung trả chuỗi khi không có phản hồi (mất mạng / quá giờ).
    expect(describeUploadError('Something went wrong', 'presign')).toEqual({ key: 'network', retryable: true });
  });

  it('PUT lên R2', () => {
    expect(describeUploadError(new HttpStatusError(403, '<Error>Request has expired</Error>'), 'upload')).toMatchObject({ key: 'linkExpired', retryable: true });
    expect(describeUploadError(new HttpStatusError(500, ''), 'upload')).toMatchObject({ key: 'failed', retryable: true });
    expect(describeUploadError(new HttpStatusError(0, null), 'upload')).toMatchObject({ key: 'network', retryable: true });
    expect(describeUploadError(new Error('The network connection was lost.'), 'upload')).toMatchObject({ key: 'network', retryable: true });
  });

  it('gửi tin', () => {
    expect(describeUploadError(new HttpStatusError(400, { error: 'Tệp chưa được tải lên.' }), 'send')).toMatchObject({ key: 'rejected', serverMessage: 'Tệp chưa được tải lên.' });
    expect(describeUploadError(new HttpStatusError(404, ''), 'send')).toMatchObject({ key: 'forbidden', retryable: false });
    expect(describeUploadError(new HttpStatusError(429, ''), 'send')).toMatchObject({ key: 'failed', retryable: true });
  });
});

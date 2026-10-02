import { putToPresignedUrl, readLocalFile, UploadError } from '../presigned-upload';

type FetchCall = [string, RequestInit];

function mockFetch(status: number) {
  const fn = jest.fn(async () => ({ ok: status >= 200 && status < 300, status }));
  (global as any).fetch = fn;
  return fn as unknown as jest.Mock<Promise<unknown>, FetchCall>;
}

const target = {
  objectKey: 'assistant/u1/s1/1759388711000_ab12cd.jpg',
  uploadUrl: 'https://acct.r2.cloudflarestorage.com/bucket/assistant/u1/s1/1759388711000_ab12cd.jpg?X-Amz-Signature=x',
  method: 'PUT',
  headers: { 'Content-Type': 'image/jpeg' },
};

describe('putToPresignedUrl', () => {
  const blob = { size: 812345, type: 'image/jpeg' } as unknown as Blob;

  it('PUT thẳng lên uploadUrl với đúng header đã ký, body là blob', async () => {
    const fetchMock = mockFetch(200);
    await putToPresignedUrl(target, blob, 'image/jpeg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(target.uploadUrl);
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    expect(init.body).toBe(blob);
  });

  it('không bao giờ gửi Authorization (kể cả server lỡ trả trong headers)', async () => {
    const fetchMock = mockFetch(200);
    await putToPresignedUrl({ ...target, headers: { 'Content-Type': 'image/png', Authorization: 'Bearer x' } }, blob, 'image/png');
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    expect(headers).toEqual({ 'Content-Type': 'image/png' });
  });

  it('server không trả header → chỉ Content-Type của tệp', async () => {
    const fetchMock = mockFetch(200);
    await putToPresignedUrl({ objectKey: 'k', uploadUrl: 'https://r2/x' }, blob, 'image/webp');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/webp' } });
  });

  it('403 (link hết hạn / sai chữ ký) → UploadError(403)', async () => {
    mockFetch(403);
    const err = await putToPresignedUrl(target, blob, 'image/jpeg').catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect(err.status).toBe(403);
  });

  it('mất mạng → UploadError(0)', async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(putToPresignedUrl(target, blob, 'image/jpeg')).rejects.toMatchObject({ name: 'UploadError', status: 0 });
  });
});

describe('readLocalFile', () => {
  it('đọc uri thành blob', async () => {
    const blob = { size: 3 };
    (global as any).fetch = jest.fn(async () => ({ blob: async () => blob }));
    await expect(readLocalFile('file:///a.jpg')).resolves.toBe(blob);
    expect((global as any).fetch).toHaveBeenCalledWith('file:///a.jpg');
  });
});

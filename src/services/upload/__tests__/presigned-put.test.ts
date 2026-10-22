jest.mock('expo-file-system/legacy', () => ({
  createUploadTask: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  EncodingType: { Base64: 'base64' },
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: jest.fn(async () => {}),
}));

import { putFileToPresignedUrl, UPLOAD_NETWORK_MESSAGE } from '../presigned-put';

// Ảnh (đăng ký khuôn mặt, chấm công gửi nhóm) PUT thẳng lên R2: mạng chập chờn thì thử lại, treo thì huỷ — trước đây
// fetch không giới hạn thời gian, 4G yếu là treo rồi báo "Network request failed" (chủ báo 2026-10-22).

const noSleep = async () => {};

function uploads(...results: Array<{ status: number } | Error | 'hang'>) {
  let i = 0;
  const cancel = jest.fn();
  const upload = jest.fn(() => {
    const r = results[Math.min(i++, results.length - 1)];
    return {
      run: () =>
        r === 'hang' ? new Promise<never>(() => {}) : r instanceof Error ? Promise.reject(r) : Promise.resolve(r),
      cancel,
    };
  });
  return { upload, cancel };
}

describe('putFileToPresignedUrl', () => {
  it('retries a dropped connection and succeeds', async () => {
    const u = uploads(new Error('Network request failed'), { status: 200 });
    await putFileToPresignedUrl('https://r2/x', 'file:///a.jpg', 'image/jpeg', { upload: u.upload, sleep: noSleep });
    expect(u.upload).toHaveBeenCalledTimes(2);
  });

  it('gives up with a readable message after the retries', async () => {
    const u = uploads(new Error('Network request failed'));
    await expect(
      putFileToPresignedUrl('https://r2/x', 'file:///a.jpg', 'image/jpeg', { upload: u.upload, sleep: noSleep, retries: 2 }),
    ).rejects.toThrow(UPLOAD_NETWORK_MESSAGE);
    expect(u.upload).toHaveBeenCalledTimes(3);
  });

  it('cancels an upload that hangs past the timeout and tries again', async () => {
    const u = uploads('hang', { status: 200 });
    await putFileToPresignedUrl('https://r2/x', 'file:///a.jpg', 'image/jpeg', {
      upload: u.upload,
      sleep: noSleep,
      timeoutMs: 10,
    });
    expect(u.cancel).toHaveBeenCalledTimes(1);
    expect(u.upload).toHaveBeenCalledTimes(2);
  });

  it('does not retry a rejected signature (4xx)', async () => {
    const u = uploads({ status: 403 });
    await expect(
      putFileToPresignedUrl('https://r2/x', 'file:///a.jpg', 'image/jpeg', { upload: u.upload, sleep: noSleep }),
    ).rejects.toThrow('403');
    expect(u.upload).toHaveBeenCalledTimes(1);
  });
});

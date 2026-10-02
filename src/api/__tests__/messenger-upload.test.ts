import * as fs from 'fs';
import * as path from 'path';
import { act, renderHook, waitFor } from '@testing-library/react-native';

// ----------------------------------------------------------------------
// Luật chủ app: "ảnh gửi phải dùng presignURL không gửi ảnh lên backend". Khoá lại luồng gửi ảnh/tệp chat:
// xin URL (JSON) → PUT thẳng lên R2 (không Authorization) → gửi tin kèm objectKey (JSON). Không FormData.
// ----------------------------------------------------------------------

const mockLog: string[] = [];
const mockBodies: unknown[] = [];

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'client-msg-1' }));

jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  createUploadTask: jest.fn((url: string, uri: string, options: { headers?: Record<string, string> }) => ({
    uploadAsync: async () => {
      mockLog.push(`put ${url}`);
      mockBodies.push({ uri, options });
      return { status: 200, body: '' };
    },
  })),
}));

jest.mock('../axios', () => {
  const actual = jest.requireActual('../axios');
  const post = jest.fn(async (url: string, body: unknown) => {
    mockBodies.push(body);
    if (url.endsWith('/attachments/presign')) {
      mockLog.push('presign');
      const files = (body as { files: { fileName: string; contentType: string }[] }).files;
      return {
        status: 200,
        data: {
          expiresAt: '2026-10-02T09:15:00Z',
          files: files.map((f, i) => ({
            objectKey: `messenger/conv-1/u1/${i}_${f.fileName}`,
            uploadUrl: `https://acct.r2.cloudflarestorage.com/b/messenger/conv-1/u1/${i}?X-Amz-Signature=x`,
            method: 'PUT',
            headers: { 'Content-Type': f.contentType },
          })),
        },
      };
    }
    if (url.endsWith('/messages')) {
      mockLog.push('messages');
      return { status: 200, data: { id: 'm1', conversationId: 'conv-1', senderId: 'u1', content: '', createdAt: '2026-10-02T09:00:00Z' } };
    }
    throw new Error(`unexpected POST ${url}`);
  });
  return { ...actual, __esModule: true, default: { post, get: jest.fn(), delete: jest.fn() } };
});

const mockAddMessage = jest.fn();
jest.mock('src/store/messenger-store', () => ({
  useMessengerStore: (select: (s: { addMessage: unknown }) => unknown) => select({ addMessage: mockAddMessage }),
}));

// Chuẩn bị ảnh (HEIC → JPEG, thu nhỏ) cần native — ở đây trả thẳng tệp đã chọn.
jest.mock('src/features/chat/attachment-prepare', () => ({
  canProcessImages: () => false,
  prepareAttachment: jest.fn(async (p: { uri: string; name: string; mimeType: string; size: number }) => ({
    uri: p.uri,
    name: p.name,
    contentType: p.mimeType,
    size: p.size,
    kind: p.mimeType.startsWith('image/') ? 'image' : 'file',
  })),
}));

import { uploadToPresignedUrl } from '../messenger';
import { useAttachmentOutbox } from 'src/features/chat/useAttachmentOutbox';

beforeEach(() => {
  mockLog.length = 0;
  mockBodies.length = 0;
});

describe('gửi ảnh/tệp chat qua presigned URL', () => {
  it('thứ tự: xin URL → PUT lên R2 → gửi tin kèm objectKey; mọi body gửi API là JSON, không FormData', async () => {
    const { result } = renderHook(() => useAttachmentOutbox('conv-1'));
    await act(async () => {
      await result.current.start(
        [
          { uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 812345, source: 'image' },
          { uri: 'file:///b.pdf', name: 'b.pdf', mimeType: 'application/pdf', size: 2048, source: 'document' },
        ],
        'Ảnh nè'
      );
    });
    await waitFor(() => expect(result.current.outbox).toBeNull());

    expect(mockLog[0]).toBe('presign');
    expect(mockLog.slice(1, 3).every((l) => l.startsWith('put https://acct.r2.cloudflarestorage.com/'))).toBe(true);
    expect(mockLog[3]).toBe('messages');
    expect(mockLog).toHaveLength(4);

    for (const b of mockBodies) expect(typeof FormData !== 'undefined' && b instanceof FormData).toBe(false);
    expect(mockBodies[0]).toEqual({
      files: [
        { fileName: 'a.jpg', contentType: 'image/jpeg', size: 812345 },
        { fileName: 'b.pdf', contentType: 'application/pdf', size: 2048 },
      ],
    });
    expect(mockBodies[mockBodies.length - 1]).toEqual({
      content: 'Ảnh nè',
      attachments: [
        { objectKey: 'messenger/conv-1/u1/0_a.jpg', fileName: 'a.jpg' },
        { objectKey: 'messenger/conv-1/u1/1_b.pdf', fileName: 'b.pdf' },
      ],
      clientMessageId: 'client-msg-1',
    });
  });

  it('PUT lên R2 không kèm Authorization / Cookie, giữ đúng Content-Type đã ký', async () => {
    await uploadToPresignedUrl(
      {
        objectKey: 'messenger/conv-1/u1/0_a.jpg',
        uploadUrl: 'https://acct.r2.cloudflarestorage.com/b/x?X-Amz-Signature=x',
        headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer leak', Cookie: 'a=b', 'Content-Length': '1' },
      },
      { uri: 'file:///a.jpg', contentType: 'image/jpeg' }
    );
    const { options } = mockBodies[0] as { options: { headers: Record<string, string>; httpMethod: string } };
    expect(options.httpMethod).toBe('PUT');
    expect(options.headers).toEqual({ 'Content-Type': 'image/jpeg' });
  });
});

describe('không gửi ảnh lên backend bằng multipart', () => {
  const root = path.resolve(__dirname, '../..');
  const files = [
    'api/messenger.ts',
    'api/assistant.ts',
    'api/presigned-upload.ts',
    ...fs.readdirSync(path.join(root, 'features/chat')).filter((f) => /\.tsx?$/.test(f)).map((f) => `features/chat/${f}`),
    ...fs.readdirSync(path.join(root, 'features/assistant')).filter((f) => /\.tsx?$/.test(f)).map((f) => `features/assistant/${f}`),
  ];

  it.each(files)('%s không dùng FormData / multipart', (file) => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    expect(src).not.toMatch(/new\s+FormData\b/);
    expect(src).not.toMatch(/multipart\/form-data/i);
    expect(src).not.toMatch(/FileSystemUploadType\.MULTIPART/);
  });
});

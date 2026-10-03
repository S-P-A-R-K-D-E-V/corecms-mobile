import { cleaningVideoFile, firstRejectedCleaningMedia, isAcceptedCleaningMedia } from '../cleaning-media';

describe('ảnh/video minh chứng vệ sinh', () => {
  it('loại server nhận khớp core-be: JPG/PNG/WEBP/GIF + MP4/MOV/WEBM/3GP; HEIC thì không', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp']) {
      expect(isAcceptedCleaningMedia(t)).toBe(true);
    }
    for (const t of ['image/heic', 'image/heif', 'application/octet-stream', '', null, undefined]) {
      expect(isAcceptedCleaningMedia(t)).toBe(false);
    }
  });

  it('chỉ ra tệp đầu tiên server sẽ từ chối (HEIC trên bản app chưa có bộ nén)', () => {
    const jpg = { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' };
    const heic = { uri: 'file:///b.heic', name: 'IMG_0002.HEIC', type: 'image/heic' };
    expect(firstRejectedCleaningMedia([jpg, heic])).toBe(heic);
    expect(firstRejectedCleaningMedia([jpg])).toBeNull();
    expect(firstRejectedCleaningMedia([])).toBeNull();
  });

  it('video: loại theo picker, thiếu thì theo đuôi (.mov của iPhone là quicktime), tên dự phòng đúng đuôi', () => {
    expect(cleaningVideoFile({ uri: 'file:///v.mp4', fileName: 'v.mp4', mimeType: 'video/mp4' }, 0)).toEqual({
      uri: 'file:///v.mp4',
      name: 'v.mp4',
      type: 'video/mp4',
    });
    expect(cleaningVideoFile({ uri: 'file:///IMG_0003.MOV', fileName: 'IMG_0003.MOV', mimeType: null }, 0).type).toBe('video/quicktime');
    expect(cleaningVideoFile({ uri: 'file:///cache/abc.mov', mimeType: undefined }, 2, 123)).toEqual({
      uri: 'file:///cache/abc.mov',
      name: 'cleaning_123_2.mov',
      type: 'video/quicktime',
    });
    expect(cleaningVideoFile({ uri: 'content://media/42', mimeType: null }, 1, 9)).toEqual({
      uri: 'content://media/42',
      name: 'cleaning_9_1.mp4',
      type: 'video/mp4',
    });
    expect(cleaningVideoFile({ uri: 'file:///x.3gp', fileName: 'x.3gp', mimeType: 'video/3gpp' }, 0).type).toBe('video/3gpp');
  });
});

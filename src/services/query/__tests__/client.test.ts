import { shouldRetryQuery } from '../client';

// Lỗi 4xx (403 thiếu quyền, 404…) gọi lại vẫn y nguyên — chỉ thử lại một lần cho lỗi mạng / 5xx.

describe('shouldRetryQuery', () => {
  it.each([400, 401, 403, 404, 409])('không gọi lại lỗi %i', (status) => {
    expect(shouldRetryQuery(0, { status })).toBe(false);
  });

  it('lỗi mạng / 5xx / 408 / 429: thử lại đúng một lần', () => {
    expect(shouldRetryQuery(0, 'Something went wrong')).toBe(true);
    expect(shouldRetryQuery(0, { status: 429 })).toBe(true);
    expect(shouldRetryQuery(0, { status: 408 })).toBe(true);
    expect(shouldRetryQuery(0, { status: 503 })).toBe(true);
    expect(shouldRetryQuery(1, { status: 503 })).toBe(false);
    expect(shouldRetryQuery(0, null)).toBe(true);
  });
});

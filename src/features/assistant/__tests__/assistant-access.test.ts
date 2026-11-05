jest.mock('src/services/store-config', () => ({ isMultiStore: true, getHostApi: () => 'https://cici21chualang.vn/api' }));
jest.mock('src/api/assistant', () => ({ fetchCapabilities: jest.fn() }));

import { fetchCapabilities } from 'src/api/assistant';
import {
  canOpenAssistant,
  assistantAccessKnown,
  refreshAssistantAccess,
  __resetAssistantAccess,
} from '../assistant-access';

// Bản cửa hàng: nhân viên thường thấy Trợ lý AI khi máy chủ nói trợ lý dùng được cho họ (CiCi: tầng cici_staff);
// cửa hàng khác trả enabled=false (role_not_allowed / feature_off) → vẫn ẩn. Chủ / quản lý không cần hỏi máy chủ.

const fetchCaps = fetchCapabilities as jest.Mock;
const user = (roles: string[], id = 'u1', permissions: string[] = []) =>
  ({ id, role: roles[0], roles, permissions, enabledFeatures: ['ai.assistant'] }) as any;

describe('assistant-access (bản cửa hàng)', () => {
  beforeEach(() => {
    __resetAssistantAccess();
    fetchCaps.mockReset();
  });

  it('quản lý thấy ngay, không gọi máy chủ', async () => {
    const manager = user(['Manager']);
    expect(canOpenAssistant(manager)).toBe(true);
    expect(assistantAccessKnown(manager)).toBe(true);
    await refreshAssistantAccess(manager);
    expect(fetchCaps).not.toHaveBeenCalled();
  });

  it('nhân viên CiCi thấy trợ lý khi máy chủ báo enabled (tầng cici_staff)', async () => {
    const staff = user(['Staff']);
    expect(canOpenAssistant(staff)).toBe(false);
    expect(assistantAccessKnown(staff)).toBe(false);

    fetchCaps.mockResolvedValue({ enabled: true, tier: 'cici_staff' });
    await refreshAssistantAccess(staff);

    expect(assistantAccessKnown(staff)).toBe(true);
    expect(canOpenAssistant(staff)).toBe(true);
    // Hỏi một lần cho mỗi người dùng.
    await refreshAssistantAccess(staff);
    expect(fetchCaps).toHaveBeenCalledTimes(1);
  });

  it('cửa hàng không có trợ lý nhân viên: vẫn ẩn', async () => {
    const staff = user(['Staff'], 'u2');
    fetchCaps.mockResolvedValue({ enabled: false, reason: 'role_not_allowed', tier: 'none' });
    await refreshAssistantAccess(staff);
    expect(assistantAccessKnown(staff)).toBe(true);
    expect(canOpenAssistant(staff)).toBe(false);
  });

  it('máy chủ lỗi / bản cũ (404 → null): ẩn', async () => {
    const staff = user(['Staff'], 'u3');
    fetchCaps.mockRejectedValue(new Error('network'));
    await refreshAssistantAccess(staff);
    expect(canOpenAssistant(staff)).toBe(false);

    __resetAssistantAccess();
    fetchCaps.mockResolvedValue(null);
    await refreshAssistantAccess(staff);
    expect(canOpenAssistant(staff)).toBe(false);
  });

  it('kết quả gắn với người dùng: đổi tài khoản thì hỏi lại', async () => {
    fetchCaps.mockResolvedValue({ enabled: true, tier: 'cici_staff' });
    await refreshAssistantAccess(user(['Staff'], 'a'));
    expect(canOpenAssistant(user(['Staff'], 'b'))).toBe(false);
    expect(assistantAccessKnown(user(['Staff'], 'b'))).toBe(false);
  });
});

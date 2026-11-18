import { existsSync } from 'fs';
import { join } from 'path';

import {
  NOTIFICATION_APP_ROUTES,
  agentActionIdOf,
  agentTaskIdFromUrl,
  agentTaskIdOf,
  notificationAppRoute,
  notificationTargetRoute,
  notificationWebUrl,
} from '../notification-links';

// Chạm thông báo: mở màn tương ứng trên app; không có màn thì trang chi tiết với nút mở trên web; không nhận link ra ngoài.

describe('notificationAppRoute', () => {
  it('đường dẫn web có màn tương ứng → màn app, bỏ query và dấu / cuối', () => {
    expect(notificationAppRoute('/dashboard/hr/leave')).toBe('/hr/leave');
    expect(notificationAppRoute('/dashboard/hr/performance?tab=mine')).toBe('/hr/performance');
    expect(notificationAppRoute('/dashboard/shift-pool/my-posts/')).toBe('/shift-pool');
    expect(notificationAppRoute('/dashboard/payroll/complaints')).toBe('/(tabs)/admin/payroll-complaints');
  });

  it('không có màn tương ứng hoặc đường dẫn lạ → null', () => {
    expect(notificationAppRoute('/dashboard/fnb/stock')).toBeNull();
    expect(notificationAppRoute('/dashboard')).toBeNull();
    expect(notificationAppRoute(undefined)).toBeNull();
    expect(notificationAppRoute(123)).toBeNull();
    expect(notificationAppRoute('https://evil.example/dashboard/hr/leave')).toBeNull();
    expect(notificationAppRoute('//evil.example/dashboard/hr/leave')).toBeNull();
  });

  it('mọi màn được nhắm tới đều có thật trong src/app', () => {
    const appDir = join(__dirname, '..', '..', 'app');
    const missing = NOTIFICATION_APP_ROUTES.filter((route) => {
      const file = join(appDir, route);
      return !existsSync(`${file}.tsx`) && !existsSync(join(file, 'index.tsx'));
    });
    expect(missing).toEqual([]);
  });
});

describe('notificationWebUrl', () => {
  it('ghép với gốc web của cửa hàng, giữ query', () => {
    expect(notificationWebUrl('/dashboard/fnb/stock?x=1', 'https://shop.vn/')).toBe('https://shop.vn/dashboard/fnb/stock?x=1');
  });

  it('link ra ngoài, đường dẫn thoát thư mục, hoặc không có gốc web → null', () => {
    expect(notificationWebUrl('https://evil.example', 'https://shop.vn')).toBeNull();
    expect(notificationWebUrl('/dashboard/../../evil', 'https://shop.vn')).toBeNull();
    expect(notificationWebUrl('/login', 'https://shop.vn')).toBeNull();
    expect(notificationWebUrl('/dashboard/fnb/stock', null)).toBeNull();
    expect(notificationWebUrl('/dashboard/fnb/stock', 'javascript:alert(1)')).toBeNull();
  });
});

// Agent xin duyệt lệnh ghi (K3): core-be gửi actionUrl /dashboard/agent/approvals + data {"agentActionId": "<id>"}.
describe('phiếu agent xin duyệt', () => {
  const ID = '3f2b8c1e-1d2a-4c5b-9e8f-0a1b2c3d4e5f';

  it('agentActionIdOf: data object hoặc chuỗi JSON; không phải GUID → null', () => {
    expect(agentActionIdOf({ agentActionId: ID })).toBe(ID);
    expect(agentActionIdOf(JSON.stringify({ agentActionId: ID }))).toBe(ID);
    expect(agentActionIdOf({ agentActionId: '../../evil' })).toBeNull();
    expect(agentActionIdOf({ agentActionId: 42 })).toBeNull();
    expect(agentActionIdOf(undefined)).toBeNull();
    expect(agentActionIdOf('not json')).toBeNull();
  });

  it('có mã phiếu → mở thẳng phiếu; chỉ có actionUrl → danh sách; thông báo khác như cũ', () => {
    expect(notificationTargetRoute('/dashboard/agent/approvals', { agentActionId: ID, notificationId: 'n1' })).toBe(`/agent/approvals/${ID}`);
    expect(notificationTargetRoute('/dashboard/agent/approvals', null)).toBe('/agent/approvals');
    expect(notificationAppRoute('/dashboard/agent/approvals')).toBe('/agent/approvals');
    expect(notificationTargetRoute('/dashboard/hr/leave', { notificationId: 'n1' })).toBe('/hr/leave');
    expect(notificationTargetRoute('/dashboard/fnb/stock')).toBeNull();
  });
});

// Trung tâm Agent (K4): core-be gửi data {"agentTaskId": "<id>"} + actionUrl /dashboard/agent/center?task=<id>.
describe('việc của agent', () => {
  const TASK = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  const ACTION = '3f2b8c1e-1d2a-4c5b-9e8f-0a1b2c3d4e5f';

  it('agentTaskIdOf: data object hoặc chuỗi JSON; không phải GUID → null', () => {
    expect(agentTaskIdOf({ agentTaskId: TASK })).toBe(TASK);
    expect(agentTaskIdOf(JSON.stringify({ agentTaskId: TASK }))).toBe(TASK);
    expect(agentTaskIdOf({ agentTaskId: '../evil' })).toBeNull();
    expect(agentTaskIdOf({ agentTaskId: 7 })).toBeNull();
    expect(agentTaskIdOf(null)).toBeNull();
  });

  it('agentTaskIdFromUrl: chỉ đọc ?task= của /dashboard/agent/center, phải là GUID', () => {
    expect(agentTaskIdFromUrl(`/dashboard/agent/center?task=${TASK}`)).toBe(TASK);
    expect(agentTaskIdFromUrl(`/dashboard/agent/center?tab=board&task=${TASK}`)).toBe(TASK);
    expect(agentTaskIdFromUrl('/dashboard/agent/center')).toBeNull();
    expect(agentTaskIdFromUrl('/dashboard/agent/center?task=abc')).toBeNull();
    expect(agentTaskIdFromUrl(`/dashboard/hr/leave?task=${TASK}`)).toBeNull();
    expect(agentTaskIdFromUrl(`https://evil.example/dashboard/agent/center?task=${TASK}`)).toBeNull();
  });

  it('data.agentTaskId → chi tiết việc, với mọi actionUrl', () => {
    expect(notificationTargetRoute(`/dashboard/agent/center?task=${TASK}`, { agentTaskId: TASK })).toBe(`/agent/tasks/${TASK}`);
    expect(notificationTargetRoute(undefined, JSON.stringify({ agentTaskId: TASK }))).toBe(`/agent/tasks/${TASK}`);
  });

  it('chỉ có actionUrl /dashboard/agent/center: có ?task= → chi tiết việc, không có → danh sách việc', () => {
    expect(notificationTargetRoute(`/dashboard/agent/center?task=${TASK}`, null)).toBe(`/agent/tasks/${TASK}`);
    expect(notificationTargetRoute('/dashboard/agent/center', null)).toBe('/agent/tasks');
    expect(notificationTargetRoute('/dashboard/agent/center?task=xyz', {})).toBe('/agent/tasks');
    expect(notificationAppRoute('/dashboard/agent/center/')).toBe('/agent/tasks');
  });

  it('phiếu duyệt (agentActionId) vẫn được xét trước', () => {
    expect(notificationTargetRoute(`/dashboard/agent/center?task=${TASK}`, { agentActionId: ACTION, agentTaskId: TASK })).toBe(
      `/agent/approvals/${ACTION}`
    );
    expect(notificationTargetRoute('/dashboard/agent/approvals', { agentActionId: ACTION })).toBe(`/agent/approvals/${ACTION}`);
  });
});

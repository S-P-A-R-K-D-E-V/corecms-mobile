// Máy quầy: danh sách người theo nhóm trạng thái ca; ca chưa gắn chi nhánh (cửa hàng nhiều chi nhánh) gom riêng cuối.

jest.mock('src/components/ui', () => ({}));
jest.mock('src/components/overlay', () => ({}));
jest.mock('src/auth/auth-context', () => ({}));
jest.mock('src/api/axios', () => ({}));
jest.mock('src/api/counter', () => ({}));
jest.mock('src/services/counter-mode', () => ({}));
jest.mock('src/services/store-config', () => ({}));
jest.mock('src/features/auth/SignInControls', () => ({}));
jest.mock('../CounterQrPanel', () => ({}));

import type { CounterPerson } from 'src/api/counter';
import { groupRoster } from '../CounterLockScreen';

const person = (userId: string, status: string, atThisBranch?: boolean): CounterPerson => ({
  userId,
  fullName: userId,
  role: 'Staff',
  status,
  canSignIn: true,
  hasApp: true,
  atThisBranch,
});

describe('groupRoster', () => {
  it('xếp theo trạng thái, ca chưa gắn chi nhánh ngay sau người của chi nhánh', () => {
    const groups = groupRoster([
      person('a', 'ended'),
      person('b', 'working', false),
      person('c', 'working'),
      person('d', 'manager'),
      person('e', 'upcoming', true),
    ]);
    expect(groups.map(([k, list]) => [k, list.map((p) => p.userId)])).toEqual([
      ['working', ['c']],
      ['upcoming', ['e']],
      ['otherBranch', ['b']],
      ['manager', ['d']],
      ['ended', ['a']],
    ]);
  });

  it('server cũ không gửi atThisBranch: coi như cùng chi nhánh', () => {
    expect(groupRoster([person('a', 'working')]).map(([k]) => k)).toEqual(['working']);
  });
});

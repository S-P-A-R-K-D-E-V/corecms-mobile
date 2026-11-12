import { migrateV2Pins } from '../store';

describe('Nâng bộ ghim v2 → v3', () => {
  it('chèn "Ghi vi phạm" ngay sau "Duyệt yêu cầu", giữ nguyên ghim cũ', () => {
    expect(migrateV2Pins(['pos', 'approvals', 'users'])).toEqual(['pos', 'approvals', 'record-violation', 'users']);
  });

  it('không có "Duyệt yêu cầu" thì đưa lên đầu', () => {
    expect(migrateV2Pins(['pos', 'products'])).toEqual(['record-violation', 'pos', 'products']);
  });

  it('đã ghim rồi thì giữ nguyên', () => {
    const keys = ['record-violation', 'pos'];
    expect(migrateV2Pins(keys)).toBe(keys);
  });
});

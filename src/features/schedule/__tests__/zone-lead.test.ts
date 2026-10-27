import { zoneLeadParts } from '../zone-lead';

// Lịch làm hiện khu phụ trách + trưởng ca (đặt trên web ở "Khu & trưởng ca").

describe('zoneLeadParts', () => {
  it('trưởng ca trước, rồi các khu', () => {
    expect(zoneLeadParts({ zones: ['A', 'C'], isShiftLead: true })).toEqual(['Trưởng ca', 'Khu A, C']);
    expect(zoneLeadParts({ zones: ['B'], isShiftLead: false })).toEqual(['Khu B']);
  });

  it('chưa phân khu / bản BE cũ không trả trường → không hiện gì', () => {
    expect(zoneLeadParts({ zones: [], isShiftLead: false })).toEqual([]);
    expect(zoneLeadParts({})).toEqual([]);
    expect(zoneLeadParts({ zones: null })).toEqual([]);
  });
});

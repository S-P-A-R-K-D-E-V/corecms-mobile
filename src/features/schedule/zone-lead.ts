// ----------------------------------------------------------------------
// Khu phụ trách + trưởng ca của một ca được phân (core-be MyScheduleResponse.Zones / IsShiftLead, đặt trên web ở
// "Khu & trưởng ca"). Bản BE cũ không trả hai trường này → không hiện gì.
// ----------------------------------------------------------------------

export function zoneLeadParts(a: { zones?: readonly string[] | null; isShiftLead?: boolean | null }): string[] {
  const parts: string[] = [];
  if (a.isShiftLead) parts.push('Trưởng ca');
  const zones = (a.zones ?? []).filter((z) => typeof z === 'string' && z.trim());
  if (zones.length > 0) parts.push(`Khu ${zones.join(', ')}`);
  return parts;
}

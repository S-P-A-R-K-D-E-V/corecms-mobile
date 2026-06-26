import type { IBranchLocation } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Tiện ích định vị dùng chung cho check-in & cổng GPS (kiểm tiền quầy).
// ----------------------------------------------------------------------

export type LatLng = { latitude: number; longitude: number };

/** Khoảng cách giữa 2 toạ độ (Haversine) — đơn vị mét. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "x m" khi < 1km, ngược lại "x.x km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Khoảng cách (mét) tới chi nhánh gần nhất có toạ độ; null nếu không có dữ liệu. */
export function nearestBranchDistance(coords: LatLng, branches: { latitude?: number; longitude?: number }[]): number | null {
  let min: number | null = null;
  for (const b of branches) {
    if (b.latitude == null || b.longitude == null) continue;
    const d = haversineMeters(coords, { latitude: b.latitude, longitude: b.longitude });
    if (min === null || d < min) min = d;
  }
  return min;
}

export type NearestBranch = {
  branch: IBranchLocation;
  distance: number;
  radius: number;
  /** Có nằm trong bán kính geofence của chi nhánh gần nhất không. */
  within: boolean;
};

/** Chi nhánh gần nhất + khoảng cách + có đang trong khu vực cửa hàng không.
 *  Dùng cho cả overlay địa chỉ (check-in) và chặn truy cập (kiểm tiền quầy). */
export function findNearestBranch(coords: LatLng, branches: IBranchLocation[]): NearestBranch | null {
  let best: NearestBranch | null = null;
  for (const b of branches) {
    if (b.latitude == null || b.longitude == null) continue;
    const distance = haversineMeters(coords, { latitude: b.latitude, longitude: b.longitude });
    const radius = b.geofenceRadius || 0;
    if (best === null || distance < best.distance) {
      best = { branch: b, distance, radius, within: radius > 0 && distance <= radius };
    }
  }
  return best;
}

/** Reverse-geocode toạ độ → địa chỉ (logic giống core-fe: Nominatim OSM).
 *  Trả null nếu lỗi mạng/không có dữ liệu. */
export async function reverseGeocode(coords: LatLng): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&addressdetails=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'CoreCmsMobile/1.0' } });
    const data = await res.json();
    const addr = data?.address;
    if (addr) {
      const parts = [addr.road, addr.suburb, addr.city_district, addr.city ?? addr.town, addr.country].filter(Boolean);
      return parts.join(', ') || data?.display_name || null;
    }
    return data?.display_name ?? null;
  } catch {
    return null;
  }
}

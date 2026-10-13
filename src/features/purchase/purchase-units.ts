// ----------------------------------------------------------------------
// Nhập hàng theo đơn vị trên app (core-be M7 bước 1): mỗi dòng phiếu nhập chọn đơn vị gốc hoặc một đơn vị mua đã khai
// cho hàng (thùng, gói, hộp…), số lượng có thể lẻ, giá nhập là giá của MỘT đơn vị đã chọn, hạn dùng không bắt buộc.
// Máy chủ tự quy về đơn vị gốc và tính giá vốn; app chỉ gửi unitId + số lượng theo đơn vị đã chọn.
// ----------------------------------------------------------------------

/** Một đơn vị nhập của hàng: `unitId` null = đơn vị gốc. */
export type PurchaseUnit = { unitId: string | null; name: string; factor: number };

/** GET /products/{id}/units. */
export type ProductUnits = {
  productId: string;
  baseUnitId: string | null;
  baseUnitName: string;
  managedByKiotViet: boolean;
  units: { unitId: string | null; name: string; factor: number; source?: string; isDefaultPurchase?: boolean }[];
};

/** Đơn vị chọn được cho một dòng: đơn vị gốc đứng đầu (unitId null), rồi các đơn vị mua theo hệ số tăng dần. */
export function unitOptions(units: ProductUnits): PurchaseUnit[] {
  const conversions = units.units
    .filter((u) => u.unitId != null && u.unitId !== units.baseUnitId && u.factor > 0)
    .map((u) => ({ unitId: u.unitId, name: u.name, factor: u.factor }))
    .sort((a, b) => a.factor - b.factor);
  return [{ unitId: null, name: units.baseUnitName, factor: 1 }, ...conversions];
}

/** Đơn vị mặc định khi thêm dòng: đơn vị nhập mặc định của hàng, không có thì đơn vị gốc. */
export function defaultUnit(units: ProductUnits): PurchaseUnit {
  const options = unitOptions(units);
  const preferred = units.units.find((u) => u.isDefaultPurchase && u.unitId != null && u.unitId !== units.baseUnitId);
  return options.find((o) => o.unitId === preferred?.unitId) ?? options[0];
}

/** Số lượng nhập tay (nhận dấu phẩy thập phân, tối đa 4 số lẻ); không hợp lệ hoặc âm → null. */
export function parseDecimal(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  if (text.trim() === '' || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Hạn dùng nhập tay: "31/12/2026" hoặc "2026-12-31" → "2026-12-31"; để trống → null (không ghi hạn);
 * sai định dạng / ngày không có thật → undefined.
 */
export function parseExpiry(text: string): string | null | undefined {
  const value = text.trim();
  if (value === '') return null;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const parts = dmy ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])] : ymd ? [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])] : null;
  if (!parts) return undefined;
  const [y, m, d] = parts;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return date.toISOString().slice(0, 10);
}

/** Số lượng quy về đơn vị gốc — để hiện "= 1.000 g" bên cạnh "2 gói". */
export const baseQuantity = (quantity: number, unit: PurchaseUnit | null) =>
  Math.round(quantity * (unit?.factor ?? 1) * 10_000) / 10_000;

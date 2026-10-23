// Phần lõi của gói `qrcode` (thuần JS) — app chỉ cần ma trận điểm, tự vẽ bằng react-native-svg (pos/qr-code.ts).
declare module 'qrcode/lib/core/qrcode' {
  export type QrSegment = { data: string | number[] | Uint8Array; mode: 'byte' | 'alphanumeric' | 'numeric' | 'kanji' };

  export function create(
    data: string | QrSegment[],
    options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }
  ): { modules: { size: number; data: ArrayLike<number | boolean> }; version: number };
}

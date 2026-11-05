// ----------------------------------------------------------------------
// VietQR cho chuyển khoản người-tới-người (trả lương):
//  • buildVietQrPayload — chuỗi EMVCo NAPAS 247 (giống core-be VietQrPayload), vẽ QR tại chỗ, không cần ảnh
//    img.vietqr.io (VietQR thông báo 14/10/2026 bỏ PNG/JPEG của Quick Link trong năm 2027; trình duyệt đã bị
//    chuyển hướng sang .svg). Bản sao của core-fe src/utils/vietqr.ts — sửa thì sửa cả hai.
//  • buildBankDeeplink — link https://dl.vietqr.io/pay mở thẳng app ngân hàng của NGƯỜI CHUYỂN, điền sẵn
//    STK / số tiền / nội dung với các app có autofill (https://www.vietqr.io/danh-sach-api/deeplink-app-ngan-hang/).
// ----------------------------------------------------------------------

const NAPAS_GUID = 'A000000727';
const TRANSFER_TO_ACCOUNT = 'QRIBFTTA';

/** Nội dung dài nhất VietQR tự đặt vào trường 62.08 (Quick Link addInfo). */
export const VIETQR_MAX_CONTENT = 50;
export const VIETQR_MAX_AMOUNT = 9_999_999_999_999;

/**
 * Bỏ dấu (đ → d), chỉ giữ [A-Za-z0-9 -], gộp khoảng trắng, tối đa 50 ký tự.
 * `trim = false` khi đang gõ để còn gõ được dấu cách cuối.
 */
export function sanitizeTransferContent(text: string, trim = true): string {
  const ascii = text
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 -]/g, ' ')
    .replace(/ {2,}/g, ' ');
  const cut = (trim ? ascii.trim() : ascii.replace(/^ +/, '')).slice(0, VIETQR_MAX_CONTENT);
  return trim ? cut.trimEnd() : cut;
}

/** Nội dung trong mã QR: như core-be VietQrPayload.NormalizeContent — chỉ chữ / số ASCII, còn lại thành 1 khoảng trắng. */
function qrContent(text: string): string {
  return sanitizeTransferContent(text)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .slice(0, VIETQR_MAX_CONTENT)
    .trimEnd();
}

/**
 * Độ dài tối đa của nội dung (tn) trong link dl.vietqr.io để app ngân hàng còn tự điền.
 * Chủ thử trên app MB 06/11/2026: nội dung 21–23 ký tự tự điền, 40+ ký tự thì app mở trống.
 * Chưa biết ngưỡng chính xác nên giữ 25.
 */
export const DEEPLINK_MAX_CONTENT = 25;

/**
 * Nội dung rút gọn cho link mở app ngân hàng (mã QR vẫn giữ nội dung đầy đủ).
 * Thứ tự: bỏ cụm "thanh toan" và chữ "cho"; bỏ chữ đứng trước kỳ lương (tên cửa hàng, "luong");
 * bỏ tên đệm (chữ giữa kỳ lương và tên cuối); cuối cùng cắt theo ranh giới chữ.
 * Ví dụ "CiCi thanh toan luong T10 2026 cho Tra My" → "luong T10 2026 Tra My",
 * "Luong T11 2026 cho Nguyen Thi Thanh Huong" → "T11 2026 Nguyen Thi Huong".
 */
export function deeplinkContent(text: string, max: number = DEEPLINK_MAX_CONTENT): string {
  let s = qrContent(text);
  if (s.length <= max) return s;
  s = s
    .replace(/\bthanh toan\b/gi, ' ')
    .replace(/\bcho\b/gi, ' ')
    .replace(/ +/g, ' ')
    .trim();
  const words = s.split(' ').filter(Boolean);
  const len = () => words.join(' ').length;
  const firstDigit = words.findIndex((w) => /\d/.test(w));
  if (firstDigit > 0) {
    let drop = 0;
    while (len() > max && drop < firstDigit) {
      words.shift();
      drop++;
    }
    let lastDigit = -1;
    words.forEach((w, i) => {
      if (/\d/.test(w)) lastDigit = i;
    });
    // Bỏ tên đệm: chữ ngay trước chữ cuối, chừa ít nhất 2 chữ tên sau kỳ lương.
    while (len() > max && words.length - 1 - lastDigit > 2) words.splice(words.length - 2, 1);
  }
  s = words.join(' ');
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > 0 ? cut.slice(0, sp) : s.slice(0, max)).trim();
}

function field(id: string, value: string): string {
  if (value.length === 0 || value.length > 99) throw new Error(`VietQR field ${id} length`);
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/** CRC-16/CCITT-FALSE (0x1021, khởi tạo 0xFFFF), 4 chữ số hex in hoa. Chuỗi vào là ASCII. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Số tài khoản bỏ khoảng trắng / chấm / gạch; phải là 1–19 chữ hoặc số ASCII, không thì null. */
export function cleanAccountNumber(account: string | null | undefined): string | null {
  const cleaned = (account ?? '').replace(/[\s.-]/g, '');
  return /^[A-Za-z0-9]{1,19}$/.test(cleaned) ? cleaned : null;
}

/**
 * Chuỗi VietQR EMVCo (QR dùng một lần khi có số tiền). Thiếu / sai BIN, STK, số tiền → null để nơi gọi dùng dự phòng.
 * Số tiền làm tròn lên đồng (như mark-paid).
 */
export function buildVietQrPayload(
  bin: string | null | undefined,
  account: string | null | undefined,
  amount: number | null | undefined,
  content?: string | null
): string | null {
  const cleanBin = (bin ?? '').trim();
  const acc = cleanAccountNumber(account);
  if (!/^\d{6}$/.test(cleanBin) || !acc) return null;
  const am = amount == null ? null : Math.ceil(amount);
  if (am !== null && (!Number.isFinite(am) || am <= 0 || am > VIETQR_MAX_AMOUNT)) return null;

  const merchant =
    field('00', NAPAS_GUID) +
    field('01', field('00', cleanBin) + field('01', acc)) +
    field('02', TRANSFER_TO_ACCOUNT);
  let payload =
    field('00', '01') +
    field('01', am !== null ? '12' : '11') +
    field('38', merchant) +
    field('53', '704');
  if (am !== null) payload += field('54', String(am));
  payload += field('58', 'VN');
  const purpose = qrContent(content ?? '');
  if (purpose) payload += field('62', field('08', purpose));
  payload += '6304';
  return payload + crc16(payload);
}

// ── Deeplink mở app ngân hàng ────────────────────────────────────────────

export type BankAppOs = 'ios' | 'android';

export type VietQrBankApp = {
  appId: string;
  appName: string;
  appLogo: string;
  bankName: string;
  /** 1 = app điền sẵn STK / số tiền / nội dung; 0 = chỉ mở app. */
  autofill: number;
  monthlyInstall?: number;
};

const appListCache: Partial<Record<BankAppOs, Promise<VietQrBankApp[]>>> = {};

/** Danh sách app ngân hàng hỗ trợ deeplink (api.vietqr.io), app điền sẵn lên đầu, rồi theo lượt cài. */
export function getBankApps(os: BankAppOs): Promise<VietQrBankApp[]> {
  if (!appListCache[os]) {
    appListCache[os] = fetch(`https://api.vietqr.io/v2/${os}-app-deeplinks`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { apps?: VietQrBankApp[] }) => sortBankApps(j.apps ?? []))
      .catch((e) => {
        delete appListCache[os];
        throw e;
      });
  }
  return appListCache[os]!;
}

export function sortBankApps(apps: VietQrBankApp[]): VietQrBankApp[] {
  return [...apps].sort(
    (a, b) =>
      (b.autofill ? 1 : 0) - (a.autofill ? 1 : 0) ||
      (b.monthlyInstall ?? 0) - (a.monthlyInstall ?? 0)
  );
}

/**
 * https://dl.vietqr.io/pay?app=&am=&tn=&ba=STK@mã-NH&url= — trang trung gian của VietQR mở app (intent:// trên
 * Android, scheme trên iOS); app không có autofill thì chỉ mở app. `bankCode` là mã VietQR của NH nhận (MB, VCB…).
 * `returnUrl` PHẢI là https: thiếu hoặc dùng scheme app (sparkstore://) thì dl.vietqr.io bỏ qua STK / số tiền / nội dung,
 * chỉ mở app trống (thử 05/11/2026).
 */
export function buildBankDeeplink(opts: {
  appId: string;
  bankCode: string;
  account: string;
  amount: number;
  content: string;
  accountName?: string | null;
  returnUrl: string;
}): string | null {
  const acc = cleanAccountNumber(opts.account);
  const code = opts.bankCode.trim().toLowerCase();
  const amount = Math.ceil(opts.amount);
  if (!acc || !/^[a-z0-9-]+$/.test(code) || !(amount > 0)) return null;
  const tn = deeplinkContent(opts.content);
  if (!tn) return null;
  // Dựng query giống hệt link mẫu của VietQR (app, am, tn, ba, url; '@' và ':/' để nguyên, khoảng trắng = '+',
  // nội dung chỉ chữ / số): link dựng bằng URLSearchParams (ba=…%40…, url=https%3A%2F%2F…, tn có '-', kèm bn) mở
  // được app nhưng KHÔNG tự điền (chủ thử 05/11/2026), link mẫu thì tự điền. Không gửi bn (tuỳ chọn).
  const q = (v: string) => encodeURIComponent(v).replace(/%20/g, '+');
  const back = q(opts.returnUrl).replace(/%3A/gi, ':').replace(/%2F/gi, '/');
  return `https://dl.vietqr.io/pay?app=${q(opts.appId)}&am=${amount}&tn=${q(tn)}&ba=${acc}@${code}&url=${back}`;
}

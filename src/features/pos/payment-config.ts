import type { IPosPaymentConnection, IPosPaymentConnectionsResponse, PaymentMethod } from 'src/types/erp';

// ----------------------------------------------------------------------
// Phương thức ở quầy theo cấu hình kênh POS của chủ cửa hàng (web Thanh toán → Cài đặt → Phương thức theo kênh, đọc qua
// GET payment/qr/connections) — phần thuần, dùng chung Bán hàng và F&B (PaymentPanel).
//   - Chưa cấu hình (configured thiếu / false — core-be cũ), chưa tải xong hoặc lỗi → mọi phương thức như trước: bán hàng
//     không được kẹt vì không đọc được cấu hình. Kết nối S Payment dùng được vẫn hiện làm nguồn chuyển khoản (như web).
//   - Đã cấu hình → chỉ phương thức trong methods ('BankTransfer' = 'Transfer' của app; 'EWallet' app chưa có). Không còn
//     phương thức nào app có → hiện đủ như trước (giống quầy web).
//   - Chuyển khoản: VietQR theo tài khoản ngân hàng (nhân viên tự xác nhận) khi allowBankAccount, và / hoặc QR động qua
//     kết nối S Payment (tự xác nhận khi tiền về, payment-source.ts). allowBankAccount = false → chỉ qua kết nối.
// ----------------------------------------------------------------------

export const POS_METHODS: readonly PaymentMethod[] = ['Cash', 'Transfer', 'Card'];

export type TransferSource =
  /** Có VietQR theo tài khoản ngân hàng của cửa hàng (như trước), có thể kèm kết nối S Payment. */
  | 'account'
  /** Chủ cửa hàng chỉ bật chuyển khoản qua kết nối S Payment (QR động). */
  | 'connectionOnly'
  /** Không bật nguồn chuyển khoản nào cho quầy. */
  | 'none';

export type PosPaymentConfig = {
  /** Phương thức hiện ở quầy, theo thứ tự của app. */
  methods: PaymentMethod[];
  transferSource: TransferSource;
  /** Nguồn chuyển khoản qua kết nối S Payment dùng được ở quầy. */
  connections: IPosPaymentConnection[];
  /** Nguồn chủ cửa hàng đặt mặc định: '' = theo tài khoản, khoá kết nối; null = máy tự nhớ. */
  defaultKey: string | null;
};

export const DEFAULT_POS_PAYMENT_CONFIG: PosPaymentConfig = {
  methods: [...POS_METHODS],
  transferSource: 'account',
  connections: [],
  defaultKey: null,
};

function appMethod(method: string): PaymentMethod | null {
  if (method === 'BankTransfer' || method === 'Transfer') return 'Transfer';
  return method === 'Cash' || method === 'Card' ? method : null;
}

export function posPaymentConfig(res: IPosPaymentConnectionsResponse | null | undefined): PosPaymentConfig {
  if (!res) return DEFAULT_POS_PAYMENT_CONFIG;
  const connections = res.enabled ? (res.connections ?? []) : [];
  if (!res.configured) return { ...DEFAULT_POS_PAYMENT_CONFIG, connections };
  const wanted = new Set((res.methods ?? []).map(appMethod));
  const methods = POS_METHODS.filter((m) => wanted.has(m));
  const transferSource: TransferSource = res.allowBankAccount !== false ? 'account' : connections.length > 0 ? 'connectionOnly' : 'none';
  return { methods: methods.length ? methods : [...POS_METHODS], transferSource, connections, defaultKey: res.defaultKey ?? null };
}

/** Hoàn tất được trên app: chuyển khoản cần ít nhất một nguồn (theo tài khoản hoặc qua kết nối). */
export function canCompleteOnApp(method: PaymentMethod, config: PosPaymentConfig): boolean {
  return method !== 'Transfer' || config.transferSource !== 'none';
}

/** Chọn sẵn phương thức đầu tiên app hoàn tất được; không có thì phương thức đầu tiên. */
export function defaultPosMethod(config: PosPaymentConfig): PaymentMethod {
  return config.methods.find((m) => canCompleteOnApp(m, config)) ?? config.methods[0] ?? 'Cash';
}

/** Cấu hình tới / đổi: nhân viên đã tự chọn phương thức còn hiện thì giữ, còn lại chọn sẵn. */
export function resolvePosMethod(current: PaymentMethod, picked: boolean, config: PosPaymentConfig): PaymentMethod {
  return picked && config.methods.includes(current) ? current : defaultPosMethod(config);
}

/** "ApiPay — MB 9704229999": tên kết nối — ngân hàng + tài khoản / VA nhận tiền. */
export function connectionLabel(connection: IPosPaymentConnection): string {
  const account = [connection.bankName, connection.accountNumber].filter(Boolean).join(' ');
  return [connection.displayName || connection.provider, account].filter(Boolean).join(' — ');
}

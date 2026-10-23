import type { IPosPaymentConnection, IPosPaymentConnectionsResponse } from 'src/types/erp';

import {
  DEFAULT_POS_PAYMENT_CONFIG,
  canCompleteOnApp,
  connectionLabel,
  defaultPosMethod,
  posPaymentConfig,
  resolvePosMethod,
} from '../payment-config';

// Cấu hình kênh POS (GET payment/qr/connections) → phương thức hiện ở quầy + nguồn chuyển khoản của app.

const apipay: IPosPaymentConnection = {
  id: 'c1',
  key: 'c1',
  provider: 'apipay',
  kind: 'bank_feed',
  displayName: 'ApiPay',
  accountNumber: '9704229999',
  bankName: 'MB',
  environment: 'live',
};

const configured = (patch: Partial<IPosPaymentConnectionsResponse>): IPosPaymentConnectionsResponse => ({
  enabled: true,
  connections: [],
  configured: true,
  methods: ['Cash', 'BankTransfer', 'Card'],
  allowBankAccount: true,
  defaultKey: null,
  ...patch,
});

describe('posPaymentConfig', () => {
  it('core-be cũ / chưa cấu hình / chưa tải / lỗi: mọi phương thức, chuyển khoản theo tài khoản như trước', () => {
    expect(posPaymentConfig(undefined)).toEqual(DEFAULT_POS_PAYMENT_CONFIG);
    expect(posPaymentConfig(null)).toEqual(DEFAULT_POS_PAYMENT_CONFIG);
    expect(posPaymentConfig({ enabled: true, connections: [apipay] })).toEqual(DEFAULT_POS_PAYMENT_CONFIG);
    // configured=false: bỏ qua cả methods / allowBankAccount nếu có.
    expect(posPaymentConfig({ enabled: true, connections: [apipay], configured: false, methods: ['Card'], allowBankAccount: false })).toEqual(
      DEFAULT_POS_PAYMENT_CONFIG
    );
    expect(DEFAULT_POS_PAYMENT_CONFIG).toEqual({ methods: ['Cash', 'Transfer', 'Card'], transferSource: 'account', connections: [] });
  });

  it("chỉ phương thức chủ cửa hàng bật, theo thứ tự của app; 'BankTransfer' là chuyển khoản", () => {
    expect(posPaymentConfig(configured({ methods: ['Card', 'BankTransfer'] })).methods).toEqual(['Transfer', 'Card']);
    expect(posPaymentConfig(configured({ methods: ['Cash'] })).methods).toEqual(['Cash']);
    // 'Transfer' (F&B) cũng nhận.
    expect(posPaymentConfig(configured({ methods: ['Transfer'] })).methods).toEqual(['Transfer']);
  });

  it('không còn phương thức nào app có (chỉ Ví, hoặc rỗng) → hiện đủ như trước, không kẹt bán hàng', () => {
    expect(posPaymentConfig(configured({ methods: ['EWallet'] })).methods).toEqual(['Cash', 'Transfer', 'Card']);
    expect(posPaymentConfig(configured({ methods: [] })).methods).toEqual(['Cash', 'Transfer', 'Card']);
    expect(posPaymentConfig(configured({ methods: null })).methods).toEqual(['Cash', 'Transfer', 'Card']);
    expect(posPaymentConfig(configured({ methods: ['EWallet', 'Card'] })).methods).toEqual(['Card']);
  });

  it('nguồn chuyển khoản: theo tài khoản / chỉ qua kết nối / chưa bật nguồn nào', () => {
    expect(posPaymentConfig(configured({ allowBankAccount: true, connections: [apipay] })).transferSource).toBe('account');
    // Thiếu trường allowBankAccount = cho phép (như web).
    expect(posPaymentConfig(configured({ allowBankAccount: undefined })).transferSource).toBe('account');
    const onlyConnection = posPaymentConfig(configured({ allowBankAccount: false, connections: [apipay], defaultKey: 'c1' }));
    expect(onlyConnection.transferSource).toBe('connectionOnly');
    expect(onlyConnection.connections).toEqual([apipay]);
    expect(posPaymentConfig(configured({ allowBankAccount: false, connections: [] })).transferSource).toBe('none');
    // S Payment tắt cho cửa hàng: danh sách kết nối không dùng được.
    expect(posPaymentConfig(configured({ enabled: false, allowBankAccount: false, connections: [apipay] })).transferSource).toBe('none');
  });
});

describe('chọn sẵn phương thức', () => {
  it('chọn phương thức đầu tiên', () => {
    expect(defaultPosMethod(DEFAULT_POS_PAYMENT_CONFIG)).toBe('Cash');
    expect(defaultPosMethod(posPaymentConfig(configured({ methods: ['Card', 'BankTransfer'] })))).toBe('Transfer');
    expect(defaultPosMethod(posPaymentConfig(configured({ methods: ['Card'] })))).toBe('Card');
  });

  it('chuyển khoản app không tạo được mã (chỉ qua kết nối) thì bỏ qua khi chọn sẵn; chỉ còn nó thì vẫn chọn nó', () => {
    const transferCard = posPaymentConfig(configured({ methods: ['BankTransfer', 'Card'], allowBankAccount: false, connections: [apipay] }));
    expect(canCompleteOnApp('Transfer', transferCard)).toBe(false);
    expect(canCompleteOnApp('Card', transferCard)).toBe(true);
    expect(defaultPosMethod(transferCard)).toBe('Card');
    const transferOnly = posPaymentConfig(configured({ methods: ['BankTransfer'], allowBankAccount: false }));
    expect(defaultPosMethod(transferOnly)).toBe('Transfer');
  });

  it('cấu hình tải xong: chưa tự chọn → chọn sẵn; đã chọn mà còn hiện → giữ; bị tắt → chọn sẵn', () => {
    const cardTransfer = posPaymentConfig(configured({ methods: ['BankTransfer', 'Card'] }));
    expect(resolvePosMethod('Cash', false, cardTransfer)).toBe('Transfer');
    expect(resolvePosMethod('Card', true, cardTransfer)).toBe('Card');
    expect(resolvePosMethod('Cash', true, cardTransfer)).toBe('Transfer');
    // Chưa cấu hình: giữ như trước.
    expect(resolvePosMethod('Card', true, DEFAULT_POS_PAYMENT_CONFIG)).toBe('Card');
    expect(resolvePosMethod('Cash', false, DEFAULT_POS_PAYMENT_CONFIG)).toBe('Cash');
  });
});

describe('connectionLabel', () => {
  it('tên dịch vụ — ngân hàng + tài khoản nhận', () => {
    expect(connectionLabel(apipay)).toBe('ApiPay — MB 9704229999');
    expect(connectionLabel({ ...apipay, displayName: '', bankName: null })).toBe('apipay — 9704229999');
  });
});

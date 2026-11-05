import {
  crc16,
  sortBankApps,
  buildBankDeeplink,
  buildVietQrPayload,
  sanitizeTransferContent,
} from '../vietqr';

describe('buildVietQrPayload', () => {
  it('khớp chuỗi do chính api.vietqr.io/v2/generate sinh ra (2026-11-05)', () => {
    expect(
      buildVietQrPayload(
        '970422',
        '0123456789',
        5_250_000,
        'CiCi thanh toan luong T112026 cho Nguyen Van An'
      )
    ).toBe(
      '00020101021238540010A00000072701240006970422011001234567890208QRIBFTTA5303704540752500005802VN' +
        '62510847CiCi thanh toan luong T112026 cho Nguyen Van An63045C13'
    );
  });

  it('khớp mẫu hoá đơn core-be (nội dung có khoảng trắng)', () => {
    expect(buildVietQrPayload('970436', '0123456789', 50_000, 'HD 20261006 0001')).toBe(
      '00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA53037045405500005802VN62200816HD 20261006 00016304CCA9'
    );
  });

  it('làm tròn lên số tiền, bỏ dấu và gạch nối trong nội dung', () => {
    const p = buildVietQrPayload('970436', '0011 0022 33', 3_000_000.4, 'Lương T5-2026 Đỗ Đức')!;
    expect(p).toContain('54073000001');
    expect(p).toContain('0011002233');
    expect(p).toContain('Luong T5 2026 Do Duc');
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });

  it('thiếu BIN / STK sai / số tiền ≤ 0 → null', () => {
    expect(buildVietQrPayload(null, '123', 10, 'x')).toBeNull();
    expect(buildVietQrPayload('97042', '123', 10, 'x')).toBeNull();
    expect(buildVietQrPayload('970422', '12/3', 10, 'x')).toBeNull();
    expect(buildVietQrPayload('970422', '123', 0, 'x')).toBeNull();
  });
});

describe('sanitizeTransferContent', () => {
  it('đổi đ/Đ, giữ gạch nối, tối đa 50', () => {
    expect(sanitizeTransferContent('CiCi trả lương T11-2026 cho Đặng Văn Đức!')).toBe(
      'CiCi tra luong T11-2026 cho Dang Van Duc'
    );
    expect(sanitizeTransferContent('A'.repeat(60))).toHaveLength(50);
  });

  it('khi đang gõ vẫn giữ dấu cách cuối', () => {
    expect(sanitizeTransferContent('Tra luong ', false)).toBe('Tra luong ');
    expect(sanitizeTransferContent('Tra luong ')).toBe('Tra luong');
  });
});

describe('buildBankDeeplink', () => {
  it('dựng link dl.vietqr.io với ba=STK@mã ngân hàng viết thường', () => {
    const url = new URL(
      buildBankDeeplink({
        appId: 'mb',
        bankCode: 'VCB',
        account: '0011 0022 33',
        amount: 5_000_000.2,
        content: 'CiCi thanh toan luong T11-2026 cho Đỗ Đức',
        accountName: 'Đỗ Đức',
        returnUrl: 'https://cici.example/payroll',
      })!
    );
    expect(url.origin + url.pathname).toBe('https://dl.vietqr.io/pay');
    expect(url.searchParams.get('app')).toBe('mb');
    expect(url.searchParams.get('ba')).toBe('0011002233@vcb');
    expect(url.searchParams.get('am')).toBe('5000001');
    expect(url.searchParams.get('tn')).toBe('CiCi thanh toan luong T11-2026 cho Do Duc');
    expect(url.searchParams.get('bn')).toBe('DO DUC');
    expect(url.searchParams.get('url')).toBe('https://cici.example/payroll');
  });

  it('thiếu dữ liệu → null', () => {
    const base = {
      appId: 'mb',
      bankCode: 'MB',
      account: '123',
      content: 'x',
      returnUrl: 'https://a.b',
    };
    expect(buildBankDeeplink({ ...base, amount: 0 })).toBeNull();
    expect(buildBankDeeplink({ ...base, account: '1/2', amount: 10 })).toBeNull();
  });
});

describe('sortBankApps', () => {
  it('app điền sẵn lên đầu rồi theo lượt cài', () => {
    const apps = [
      { appId: 'vcb', appName: 'VCB', appLogo: '', bankName: '', autofill: 0, monthlyInstall: 900 },
      { appId: 'ocb', appName: 'OCB', appLogo: '', bankName: '', autofill: 1, monthlyInstall: 10 },
      { appId: 'mb', appName: 'MB', appLogo: '', bankName: '', autofill: 1, monthlyInstall: 500 },
    ];
    expect(sortBankApps(apps).map((a) => a.appId)).toEqual(['mb', 'ocb', 'vcb']);
  });
});

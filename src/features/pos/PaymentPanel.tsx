import { useEffect, useMemo, useState } from 'react';
import { View, Image, TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'nativewind';

import { Text, Icon, Pressable, Chip, Spinner } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand, grey } from 'src/theme';
import { getBankAccounts } from 'src/api/erp';
import { getPosPaymentConnections } from 'src/api/payment-qr';
import { prefs } from 'src/services/storage';
import { t } from 'src/i18n';
import type { IBankAccount, IPosPaymentConnection, PaymentMethod } from 'src/types/erp';

import { money } from 'src/features/erp/shared';
import { cashSuggestions, vietQrUrl } from './payment-utils';
import { connectionLabel, defaultPosMethod, posPaymentConfig, resolvePosMethod } from './payment-config';
import {
  BY_ACCOUNT,
  POS_SOURCE_PREF_KEY,
  dynamicQrReady,
  qrPaidAmount,
  qrTransactionRef,
  resolveSource,
  sourceKey,
  sourceOptions,
} from './payment-source';
import { qrImageDataUrl } from './qr-code';
import { DynamicQrView, useDynamicQr } from './DynamicQr';
import { customerDisplay } from 'src/services/customer-display';

// ----------------------------------------------------------------------
// Thanh toán: tiền mặt (khách đưa → tiền thừa), chuyển khoản, thẻ (quẹt trên máy POS riêng). Dùng chung Bán hàng và F&B.
// Chuyển khoản có hai nguồn (chip "Nhận tiền qua"):
//   - Theo tài khoản: ảnh VietQR theo tài khoản cửa hàng + số tiền + nội dung, nhân viên tự tích đã nhận tiền;
//   - Qua kết nối S Payment: mã QR động, tiền về là tự xác nhận (DynamicQr.tsx); hoá đơn ghi mã thanh toán (SP…) để
//     core-be gắn mã với hoá đơn.
// Phương thức / nguồn hiện theo cấu hình kênh POS của chủ cửa hàng (payment-config.ts, payment-source.ts); chưa cấu
// hình / lỗi → như trước.
// ----------------------------------------------------------------------

export type PaymentState = {
  method: PaymentMethod;
  ready: boolean;
  account?: IBankAccount;
  transferRef?: string;
  /** Tiền mặt khách đưa (chỉ khi method = Cash) — F&B gửi lên làm cashTendered. */
  cashGiven?: number;
};

const METHODS: { key: PaymentMethod; icon: string }[] = [
  { key: 'Cash', icon: 'cash' },
  { key: 'Transfer', icon: 'qrcode' },
  { key: 'Card', icon: 'credit-card-outline' },
];

const sourceChipLabel = (c: IPosPaymentConnection) => `${connectionLabel(c)}${c.environment === 'test' ? ` · ${t('erp.sourceTest')}` : ''}`;

export function PaymentPanel({ total, transferRef, onChange }: { total: number; transferRef: string; onChange: (s: PaymentState) => void }) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const configQ = useQuery({ queryKey: ['payment', 'pos-connections'], queryFn: getPosPaymentConnections, staleTime: 5 * 60_000 });
  const config = useMemo(() => posPaymentConfig(configQ.data), [configQ.data]);
  const [method, setMethod] = useState<PaymentMethod>(() => defaultPosMethod(config));
  /** Nhân viên đã tự bấm chọn phương thức — cấu hình tải xong không đổi lựa chọn đó (nếu còn hiện). */
  const [picked, setPicked] = useState(false);
  const [given, setGiven] = useState<number>(total);
  const [givenText, setGivenText] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [transferOk, setTransferOk] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);

  // Nguồn chuyển khoản: chờ tải xong cấu hình + lựa chọn máy nhớ rồi mới chọn sẵn (tránh tạo mã theo nguồn này rồi đổi).
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [source, setSource] = useState<string | null>(null);
  const configSettled = !configQ.isPending;

  const banksQ = useQuery({ queryKey: ['erp', 'bank-accounts'], queryFn: getBankAccounts, staleTime: 10 * 60_000 });
  const accounts = useMemo(() => (banksQ.data ?? []).filter((a) => a.bin && a.accountNumber), [banksQ.data]);
  const options = useMemo(() => sourceOptions(config), [config]);
  const connection = source ? (config.connections.find((c) => sourceKey(c) === source) ?? null) : null;
  const byAccount = source === BY_ACCOUNT && config.transferSource === 'account';
  const account = byAccount ? (accounts.find((a) => a.id === accountId) ?? accounts[0]) : undefined;
  /** Lựa chọn kết nối gắn tài khoản của cửa hàng → hoá đơn ghi tài khoản đó (VA thì không có). */
  const linkedAccount = connection?.bankAccountId ? (banksQ.data ?? []).find((a) => a.id === connection.bankAccountId) : undefined;

  const dyn = useDynamicQr({ active: method === 'Transfer' && !!connection, amount: total, source: source ?? BY_ACCOUNT, connection, description: transferRef });
  const paidQr = connection && dyn.state.phase === 'completed' ? dyn.state.qr : null;

  useEffect(() => {
    let alive = true;
    prefs.get(POS_SOURCE_PREF_KEY).then(
      (v) => alive && setSaved(v),
      () => alive && setSaved(null)
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!configSettled || saved === undefined) return;
    setSource((current) => resolveSource(current, config, saved));
  }, [configSettled, saved, config]);

  useEffect(() => {
    setMethod((current) => resolvePosMethod(current, picked, config));
  }, [config, picked]);

  useEffect(() => {
    setGiven(total);
    setGivenText('');
  }, [total]);

  function pickSource(key: string) {
    setSource(key);
    setTransferOk(false);
    void (key ? prefs.set(POS_SOURCE_PREF_KEY, key) : prefs.remove(POS_SOURCE_PREF_KEY)).catch(() => {});
  }

  const transferReady = connection ? dynamicQrReady(dyn.state, total) : !!account && transferOk;
  const ready = method === 'Cash' ? given >= total : method === 'Transfer' ? transferReady : true;
  const payAccount = method === 'Transfer' ? (connection ? linkedAccount : account) : undefined;
  const payRef = method === 'Transfer' ? (paidQr ? qrTransactionRef(paidQr) : transferRef) : undefined;
  useEffect(() => {
    onChange({ method, ready, account: payAccount, transferRef: payRef, cashGiven: method === 'Cash' ? given : undefined });
  }, [method, ready, payAccount, payRef, given, onChange]);

  const qr = method === 'Transfer' && account ? vietQrUrl(account, total, transferRef) : null;
  const methods = METHODS.filter((m) => config.methods.includes(m.key));

  // Màn hình khách: QR to cho khách quét trên màn phụ (mã động: ảnh máy chủ hoặc tự vẽ); đóng bảng / đổi cách trả thì ẩn.
  const liveQr = method === 'Transfer' && connection && dyn.state.phase === 'active' ? dyn.state.qr : null;
  const liveImage = useMemo(() => (liveQr ? liveQr.qrDataUrl || qrImageDataUrl(liveQr.qrPayload) : null), [liveQr?.qrDataUrl, liveQr?.qrPayload]);
  useEffect(() => {
    if (liveQr && liveImage) {
      customerDisplay.setQr({
        imageUrl: liveImage,
        amount: liveQr.amount,
        bankLine: [liveQr.bankName, liveQr.accountNumber].filter(Boolean).join(' · ') || null,
        note: liveQr.paymentCode || null,
      });
    } else if (qr) {
      customerDisplay.setQr({
        imageUrl: qr,
        amount: total,
        bankLine: [account?.shortName || account?.bankName, account?.accountNumber].filter(Boolean).join(' · ') || null,
        note: transferRef || null,
      });
    } else {
      customerDisplay.setQr(null);
    }
  }, [liveQr?.amount, liveQr?.bankName, liveQr?.accountNumber, liveQr?.paymentCode, liveImage, qr, total, account?.shortName, account?.bankName, account?.accountNumber, transferRef]);
  useEffect(() => () => customerDisplay.setQr(null), []);
  // Tiền về qua kết nối → màn hình khách "Cảm ơn quý khách" ngay, không chờ nhân viên bấm Hoàn tất.
  useEffect(() => {
    if (paidQr) customerDisplay.paid(qrPaidAmount(paidQr));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidQr?.id]);

  return (
    <View className="gap-3">
      <View className="items-center py-1">
        <Text variant="caption" tone="muted">{t('erp.amountDue')}</Text>
        <Text className="text-[32px] leading-[38px] font-bold" tone="primary" style={{ fontVariant: ['tabular-nums'] }}>{money(total)}</Text>
      </View>

      <View className="flex-row gap-2">
        {methods.map((m) => {
          const on = method === m.key;
          return (
            <Pressable
              key={m.key}
              onPress={() => {
                setMethod(m.key);
                setPicked(true);
              }}
              className={cn('flex-1 items-center gap-1 py-2.5 rounded-2xl border', on ? 'bg-primary-soft border-primary' : 'border-line dark:border-line-dark')}
            >
              <Icon name={m.icon as any} size={22} tone={on ? 'primary' : 'muted'} />
              <Text variant="caption" tone={on ? 'primary' : 'muted'} className="font-semibold">{t(`payment.${m.key}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      {method === 'Cash' ? (
        <View className="gap-2">
          <Text variant="label" tone="muted">{t('erp.cashGiven')}</Text>
          <View className="flex-row items-center h-12 px-3 rounded-2xl border border-line dark:border-line-dark">
            <TextInput
              value={givenText}
              onChangeText={(v) => {
                const digits = v.replace(/[^0-9]/g, '');
                setGivenText(digits ? Number(digits).toLocaleString('vi-VN') : '');
                setGiven(digits ? Number(digits) : total);
              }}
              placeholder={money(total)}
              placeholderTextColor={grey[500]}
              keyboardType="number-pad"
              style={{ flex: 1, fontSize: 18, fontWeight: '700', color: dark ? '#FFFFFF' : brand.ink }}
            />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {cashSuggestions(total).map((v) => (
              <Chip
                key={v}
                label={v === total ? t('erp.exact') : money(v)}
                selected={given === v && (givenText !== '' || v === total)}
                color="primary"
                onPress={() => {
                  setGiven(v);
                  setGivenText(v === total ? '' : v.toLocaleString('vi-VN'));
                }}
              />
            ))}
          </View>
          <View className="flex-row items-center justify-between rounded-2xl bg-ink/5 dark:bg-white/10 px-4 py-3">
            <Text variant="bodySmall" tone={given >= total ? 'default' : 'error'} className="font-semibold">
              {given >= total ? t('erp.change') : t('erp.notEnough', { amount: money(total - given) })}
            </Text>
            <Text variant="headline" tone={given >= total ? 'success' : 'error'} className="font-bold">
              {money(Math.max(0, given - total))}
            </Text>
          </View>
        </View>
      ) : null}

      {method === 'Transfer' ? (
        config.transferSource === 'none' ? (
          <View className="flex-row items-start gap-2.5 rounded-2xl bg-warning-soft px-3.5 py-3">
            <Icon name="information-outline" size={18} tone="warning" />
            <Text variant="bodySmall" className="flex-1 text-warning-text">{t('erp.transferNoSource')}</Text>
          </View>
        ) : !configSettled || source === null ? (
          <Spinner />
        ) : (
          <View className="gap-3">
            {options.length > 1 ? (
              <View className="gap-1.5">
                <Text variant="label" tone="muted">{t('erp.transferSource')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {options.map((o) => (
                    <Chip
                      key={o.key || 'by-account'}
                      label={o.connection ? sourceChipLabel(o.connection) : t('erp.transferByAccount')}
                      selected={o.key === source}
                      color="primary"
                      // Khách đã trả qua mã động → không đổi nguồn nữa.
                      onPress={paidQr ? undefined : () => pickSource(o.key)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {connection ? (
              <DynamicQrView dyn={dyn} total={total} connection={connection} />
            ) : banksQ.isLoading ? (
              <Spinner />
            ) : !account ? (
              <Text variant="bodySmall" tone="warning">{t('erp.noBankAccount')}</Text>
            ) : (
              <View className="gap-2.5 items-center">
                {accounts.length > 1 ? (
                  <View className="flex-row flex-wrap gap-2 self-stretch">
                    {accounts.map((a) => (
                      <Chip
                        key={a.id}
                        label={`${a.shortName || a.bankName || a.code} · ${a.accountNumber?.slice(-4)}`}
                        selected={a.id === account.id}
                        color="primary"
                        onPress={() => {
                          setAccountId(a.id);
                          setTransferOk(false);
                          setQrFailed(false);
                        }}
                      />
                    ))}
                  </View>
                ) : null}
                <View className="rounded-2xl bg-white p-2" style={{ width: 236, height: 236 }}>
                  {qr && !qrFailed ? (
                    <Image source={{ uri: qr }} onError={() => setQrFailed(true)} style={{ width: 220, height: 220 }} resizeMode="contain" />
                  ) : (
                    <View className="flex-1 items-center justify-center">
                      <Icon name="qrcode-remove" size={40} tone="faint" />
                    </View>
                  )}
                </View>
                <View className="items-center">
                  <Text variant="caption" tone="muted">{t('erp.transferTo')}</Text>
                  <Text variant="bodySmall" className="font-bold">{account.bankName || account.shortName} · {account.accountNumber}</Text>
                  {account.description ? <Text variant="caption" tone="muted">{account.description}</Text> : null}
                  <Text variant="caption" tone="primary" className="font-semibold mt-0.5">{t('erp.transferRef', { ref: transferRef })}</Text>
                </View>
                <Pressable
                  onPress={() => setTransferOk((v) => !v)}
                  className={cn('self-stretch flex-row items-center gap-2.5 px-3.5 py-3 rounded-2xl border', transferOk ? 'bg-success-soft border-success' : 'border-line dark:border-line-dark')}
                >
                  <Icon name={transferOk ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} tone={transferOk ? 'success' : 'muted'} />
                  <View className="flex-1">
                    <Text variant="bodySmall" className="font-semibold">{t('erp.transferConfirm')}</Text>
                    <Text variant="caption" tone="muted">{t('erp.transferCheckHint')}</Text>
                  </View>
                </Pressable>
              </View>
            )}
          </View>
        )
      ) : null}

      {method === 'Card' ? (
        <View className="flex-row items-start gap-2.5 rounded-2xl bg-info-soft px-3.5 py-3">
          <Icon name="credit-card-outline" size={18} tone="info" />
          <Text variant="bodySmall" className="flex-1 text-info">{t('erp.cardHint')}</Text>
        </View>
      ) : null}
    </View>
  );
}

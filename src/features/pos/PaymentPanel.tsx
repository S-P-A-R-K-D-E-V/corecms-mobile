import { useEffect, useMemo, useState } from 'react';
import { View, Image, TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'nativewind';

import { Text, Icon, Pressable, Chip, Spinner } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand, grey } from 'src/theme';
import { getBankAccounts } from 'src/api/erp';
import { t } from 'src/i18n';
import type { IBankAccount, PaymentMethod } from 'src/types/erp';

import { money } from 'src/features/erp/shared';
import { cashSuggestions, vietQrUrl } from './payment-utils';

// ----------------------------------------------------------------------
// Thanh toán: tiền mặt (khách đưa → tiền thừa), chuyển khoản (ảnh VietQR theo tài khoản cửa hàng + số
// tiền + nội dung; chưa có open banking để tự đối soát → nhân viên xác nhận đã nhận tiền), thẻ (quẹt
// trên máy POS riêng). Chỉ là phương thức ghi nhận vào hoá đơn.
// ----------------------------------------------------------------------

export type PaymentState = {
  method: PaymentMethod;
  ready: boolean;
  account?: IBankAccount;
  transferRef?: string;
};

const METHODS: { key: PaymentMethod; icon: string }[] = [
  { key: 'Cash', icon: 'cash' },
  { key: 'Transfer', icon: 'qrcode' },
  { key: 'Card', icon: 'credit-card-outline' },
];

export function PaymentPanel({ total, transferRef, onChange }: { total: number; transferRef: string; onChange: (s: PaymentState) => void }) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [given, setGiven] = useState<number>(total);
  const [givenText, setGivenText] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [transferOk, setTransferOk] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);

  const banksQ = useQuery({ queryKey: ['erp', 'bank-accounts'], queryFn: getBankAccounts, staleTime: 10 * 60_000 });
  const accounts = useMemo(() => (banksQ.data ?? []).filter((a) => a.bin && a.accountNumber), [banksQ.data]);
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];

  useEffect(() => {
    setGiven(total);
    setGivenText('');
  }, [total]);

  const ready = method === 'Cash' ? given >= total : method === 'Transfer' ? !!account && transferOk : true;
  useEffect(() => {
    onChange({ method, ready, account: method === 'Transfer' ? account : undefined, transferRef: method === 'Transfer' ? transferRef : undefined });
  }, [method, ready, account, transferRef, onChange]);

  const qr = method === 'Transfer' && account ? vietQrUrl(account, total, transferRef) : null;

  return (
    <View className="gap-3">
      <View className="items-center py-1">
        <Text variant="caption" tone="muted">{t('erp.amountDue')}</Text>
        <Text className="text-[32px] leading-[38px] font-bold" tone="primary" style={{ fontVariant: ['tabular-nums'] }}>{money(total)}</Text>
      </View>

      <View className="flex-row gap-2">
        {METHODS.map((m) => {
          const on = method === m.key;
          return (
            <Pressable
              key={m.key}
              onPress={() => setMethod(m.key)}
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
        banksQ.isLoading ? (
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

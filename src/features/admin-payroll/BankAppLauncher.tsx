import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Platform, ScrollView, View } from 'react-native';

import { Button, Text, Pressable } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { prefs, PrefKeys } from 'src/services/storage';
import { getWebOrigin } from 'src/services/store-config';
import { buildBankDeeplink, deeplinkContent, getBankApps, type VietQrBankApp } from 'src/services/vietqr';

// ----------------------------------------------------------------------
// "Mở app ngân hàng" ở màn trả lương: chọn app ngân hàng CỦA NGƯỜI CHUYỂN (nhớ lần chọn trên máy), bấm là mở app qua
// https://dl.vietqr.io/pay. App có "Điền sẵn" (VietinBank, BIDV, OCB, ACB, MB — api.vietqr.io 05/11/2026) nhận luôn
// STK / số tiền / nội dung; app khác chỉ mở lên, người dùng quét QR từ ảnh đã lưu hoặc dán STK đã sao chép.
// Danh sách vẽ ngay trong sheet (hàng cuộn ngang) — không mở thêm Modal chồng lên Sheet (xem PaymentQRSheet).
// ----------------------------------------------------------------------

/** dl.vietqr.io chỉ điền sẵn khi url quay lại là https — dùng trang web của cửa hàng. */
function returnUrl(): string {
  const origin = getWebOrigin();
  return /^https:\/\//i.test(origin) ? origin : 'https://store.devbyspark.com';
}

export function BankAppLauncher({
  bankCode,
  account,
  amount,
  content,
  accountName,
}: {
  bankCode: string;
  account: string;
  amount: number;
  content: string;
  accountName?: string | null;
}) {
  const os = Platform.OS === 'ios' ? 'ios' : 'android';
  const [apps, setApps] = useState<VietQrBankApp[]>([]);
  const [failed, setFailed] = useState(false);
  const [appId, setAppId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getBankApps(os), prefs.get(PrefKeys.payrollBankApp).catch(() => null)])
      .then(([list, saved]) => {
        if (cancelled) return;
        setApps(list);
        if (saved && list.some((a) => a.appId === saved)) setAppId(saved);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [os]);

  const app = apps.find((a) => a.appId === appId) ?? null;
  // Link mở app chỉ mang nội dung rút gọn (≤ 25 ký tự); báo cho người dùng khi bị rút.
  const shortContent = useMemo(() => deeplinkContent(content), [content]);
  const shortened = shortContent !== deeplinkContent(content, Number.MAX_SAFE_INTEGER);
  const href = useMemo(
    () =>
      app
        ? buildBankDeeplink({ appId: app.appId, bankCode, account, amount, content, accountName, returnUrl: returnUrl() })
        : null,
    [app, bankCode, account, amount, content, accountName],
  );

  function choose(id: string) {
    haptics.light();
    setAppId(id);
    prefs.set(PrefKeys.payrollBankApp, id).catch(() => {});
  }

  async function open() {
    if (!href) return;
    try {
      await Linking.openURL(href);
    } catch {
      toast.error('Không mở được trang chuyển sang app ngân hàng. Hãy quét QR hoặc chép số tài khoản.', 'Không mở được');
    }
  }

  if (failed) return null;

  return (
    <View className="gap-2">
      <Text variant="caption" tone="muted">App ngân hàng bạn dùng để chuyển</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {apps.map((a) => {
          const active = a.appId === appId;
          return (
            <Pressable
              key={a.appId}
              onPress={() => choose(a.appId)}
              className={`w-20 items-center gap-1 rounded-xl p-2 border ${active ? 'border-primary bg-primary-soft' : 'border-line dark:border-line-dark'}`}
            >
              <Image source={{ uri: a.appLogo }} style={{ width: 36, height: 36, borderRadius: 8 }} />
              <Text variant="caption" numberOfLines={2} className="text-center text-[11px] leading-tight">
                {a.appName}
              </Text>
              {a.autofill ? <Text variant="caption" tone="success" className="text-[10px] font-semibold">Điền sẵn</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <Button fullWidth icon="bank-transfer-out" disabled={!href} onPress={open}>
        {app ? `Mở ${app.appName}` : 'Chọn app ngân hàng ở trên'}
      </Button>
      {app ? (
        <Text variant="caption" tone="muted">
          {app.autofill
            ? 'App sẽ điền sẵn số tài khoản, số tiền và nội dung — kiểm tra lại rồi xác nhận trong app.'
            : 'App này chưa hỗ trợ điền sẵn: app chỉ mở lên, hãy quét QR từ ảnh đã lưu hoặc dán số tài khoản đã chép.'}
          {app.autofill && shortened
            ? ` Nội dung điền sẵn được rút gọn thành «${shortContent}» (nội dung dài thì app không tự điền); mã QR vẫn giữ nội dung đầy đủ.`
            : ''}
        </Text>
      ) : null}
    </View>
  );
}

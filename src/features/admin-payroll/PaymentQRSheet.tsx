import { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import { Sheet } from 'src/components/shared';
import { Button, Text, Badge, Icon, Spinner, TextField, Pressable } from 'src/components/ui';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import type { IPreparePayrollPaymentResponse } from 'src/types/corecms-api';

import { usePreparePayment, useMarkPaid, usePayrollPayment } from './hooks';

// ----------------------------------------------------------------------
// Thanh toán lương 1 nhân viên: dựng QR VietQR (ảnh img.vietqr.io) từ thông
// tin `prepare`, tải/chia sẻ QR (expo-file-system + expo-sharing) và đánh dấu
// đã thanh toán (mark-paid). BE không trả ảnh QR — client tự dựng như core-fe.
// ----------------------------------------------------------------------

/** URL ảnh VietQR — khớp mẫu core-fe: {bank}-{account}-compact2.jpg?amount&addInfo&accountName */
function vietQrUrl(p: IPreparePayrollPaymentResponse, content: string): string {
  const q = new URLSearchParams({
    amount: String(Math.round(p.amount)),
    addInfo: content,
    accountName: p.accountName ?? '',
  });
  return `https://img.vietqr.io/image/${p.bankCode}-${p.bankAccount}-compact2.jpg?${q.toString()}`;
}

function InfoRow({ label, value, onCopy }: { label: string; value?: string; onCopy?: () => void }) {
  if (!value) return null;
  return (
    <View className="flex-row items-center gap-2 py-1">
      <Text variant="caption" tone="muted" className="w-24">{label}</Text>
      <Text variant="bodySmall" className="flex-1 font-medium" numberOfLines={1}>{value}</Text>
      {onCopy ? <Pressable onPress={onCopy} hitSlop={8}><Icon name="content-copy" size={15} tone="muted" /></Pressable> : null}
    </View>
  );
}

export function PaymentQRSheet({
  recordId,
  visible,
  onClose,
}: {
  recordId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const prepareM = usePreparePayment();
  const markM = useMarkPaid();
  const paymentQ = usePayrollPayment(visible ? recordId : undefined);

  const [prep, setPrep] = useState<IPreparePayrollPaymentResponse | null>(null);
  const [content, setContent] = useState('');
  const [txnRef, setTxnRef] = useState('');
  const [downloading, setDownloading] = useState(false);

  const alreadyPaid = paymentQ.data?.status === 'Paid';

  // Nạp thông tin prepare mỗi khi mở.
  useEffect(() => {
    if (!visible) { setPrep(null); return; }
    let cancelled = false;
    prepareM
      .mutateAsync(recordId)
      .then((d) => { if (!cancelled) { setPrep(d); setContent(d.suggestedContent); } })
      .catch((e) => { if (!cancelled) toast.error(extractApiError(e), 'Không tạo được QR'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, recordId]);

  const qrUrl = prep && prep.canPay ? vietQrUrl(prep, content || prep.suggestedContent) : null;

  async function shareQr() {
    if (!qrUrl) return;
    setDownloading(true);
    try {
      const target = `${FileSystem.cacheDirectory}salary-qr-${recordId}.jpg`;
      const { uri } = await FileSystem.downloadAsync(qrUrl, target);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Lưu / chia sẻ QR lương' });
      } else {
        toast.info('Thiết bị không hỗ trợ chia sẻ.', 'Không khả dụng');
      }
    } catch (e) {
      toast.error(extractApiError(e), 'Tải QR thất bại');
    } finally {
      setDownloading(false);
    }
  }

  async function markPaid() {
    if (!prep) return;
    const ok = await confirm({
      title: 'Đánh dấu đã thanh toán',
      message: `Xác nhận đã trả ${Number(prep.amount).toLocaleString('vi-VN')}đ cho ${prep.userFullName}?`,
      confirmText: 'Đã thanh toán',
    });
    if (!ok) return;
    try {
      await markM.mutateAsync({
        id: recordId,
        data: {
          amount: prep.amount,
          computedAmount: prep.computedAmount,
          content: content || prep.suggestedContent,
          transactionRef: txnRef.trim() || undefined,
        },
      });
      haptics.success();
      toast.success('Đã đánh dấu thanh toán.', 'Hoàn tất');
      onClose();
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không cập nhật được');
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Thanh toán lương"
      onClose={onClose}
      footer={
        alreadyPaid ? (
          <Button fullWidth variant="soft" action="neutral" onPress={onClose}>Đóng</Button>
        ) : (
          <View className="gap-2">
            <Button fullWidth variant="soft" icon="share-variant-outline" disabled={!qrUrl || downloading} loading={downloading} onPress={shareQr}>
              Tải / chia sẻ QR
            </Button>
            <Button fullWidth icon="check-decagram-outline" disabled={!prep?.canPay} loading={markM.isPending} onPress={markPaid}>
              Đánh dấu đã thanh toán
            </Button>
          </View>
        )
      }
    >
      <View className="gap-3">
        {prepareM.isPending && !prep ? (
          <View className="items-center py-8 gap-2"><Spinner /><Text variant="caption" tone="muted">Đang tạo QR…</Text></View>
        ) : !prep ? (
          <Text variant="bodySmall" tone="error">Không lấy được thông tin thanh toán.</Text>
        ) : (
          <>
            <View className="flex-row items-center justify-between">
              <View>
                <Text variant="subtitle">{prep.userFullName}</Text>
                <Text className="text-xl font-bold text-primary">{Number(prep.amount).toLocaleString('vi-VN')}đ</Text>
              </View>
              {alreadyPaid ? <Badge tone="success">Đã thanh toán</Badge> : <Badge tone="warning">Chưa trả</Badge>}
            </View>

            {alreadyPaid && paymentQ.data ? (
              <View className="px-3 py-2 rounded-xl bg-success-soft">
                <Text variant="caption" tone="success">
                  Đã trả lúc {new Date(paymentQ.data.paidAt).toLocaleString('vi-VN')} · {paymentQ.data.paidByName}
                  {paymentQ.data.transactionRef ? ` · ${paymentQ.data.transactionRef}` : ''}
                </Text>
              </View>
            ) : !prep.canPay ? (
              <View className="flex-row items-center gap-2 px-3 py-2 rounded-xl bg-error-soft">
                <Icon name="alert-circle-outline" size={16} tone="error" />
                <Text variant="caption" tone="error" className="flex-1">
                  {prep.missingInfoReason ?? 'Thiếu thông tin ngân hàng của nhân viên — không thể tạo QR.'}
                </Text>
              </View>
            ) : (
              <>
                {qrUrl ? (
                  <View className="items-center">
                    <Image source={{ uri: qrUrl }} style={{ width: 220, height: 220, borderRadius: 12 }} resizeMode="contain" />
                  </View>
                ) : null}
                <View className="rounded-2xl bg-surface dark:bg-surface-dark p-3">
                  <InfoRow label="Ngân hàng" value={prep.bankCode} />
                  <InfoRow label="Số TK" value={prep.bankAccount} />
                  <InfoRow label="Chủ TK" value={prep.accountName} />
                </View>
                <TextField label="Nội dung chuyển khoản" value={content} onChangeText={setContent} placeholder={prep.suggestedContent} />
                {!alreadyPaid ? (
                  <TextField label="Mã giao dịch (tuỳ chọn)" value={txnRef} onChangeText={setTxnRef} placeholder="Vd: FT2607..." />
                ) : null}
              </>
            )}
          </>
        )}
      </View>
    </Sheet>
  );
}

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { Image, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Text, Icon, Button, Spinner } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { cancelQrPayment, createQrPayment, getQrPaymentStatus } from 'src/api/payment-qr';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';
import type { IPosPaymentConnection, IQrPayment } from 'src/types/erp';

import { money } from 'src/features/erp/shared';
import {
  IDLE_QR,
  dynamicQrReducer,
  formatCountdown,
  qrPaidAmount,
  qrPending,
  sameTarget,
  secondsUntil,
  shouldCreateQr,
  type DynamicQrState,
  type QrTarget,
} from './payment-source';
import { QR_QUIET_ZONE, qrMatrix, qrSvgPath } from './qr-code';

// ----------------------------------------------------------------------
// Chuyển khoản qua kết nối S Payment ở quầy (giống quầy web pos-qr-payment.tsx): tạo mã QR động cho tổng tiền, hỏi
// trạng thái mỗi 4 giây (hoặc bấm Kiểm tra), tiền về đủ là tự xác nhận — không cần nhân viên tích. Tổng tiền đổi → chờ
// 1 giây rồi tạo mã mới (mã cũ huỷ trên máy chủ); bỏ mã (đổi nguồn / cách trả, đóng bảng) cũng huỷ mã đang chờ.
// ----------------------------------------------------------------------

export const QR_POLL_MS = 4_000;
const DEBOUNCE_MS = 1_000;

export type DynamicQr = {
  state: DynamicQrState;
  checking: boolean;
  check: () => void;
  cancel: () => void;
  /** Tạo mã mới (thử lại / sau khi huỷ / hết hạn). */
  renew: () => void;
};

export function useDynamicQr({
  active,
  amount,
  source,
  connection,
  description,
}: {
  /** Đang chọn chuyển khoản qua kết nối (đã chọn xong nguồn). */
  active: boolean;
  amount: number;
  source: string;
  connection: IPosPaymentConnection | null;
  description?: string;
}): DynamicQr {
  const [state, dispatch] = useReducer(dynamicQrReducer, IDLE_QR);
  const [checking, setChecking] = useState(false);
  const [debounced, setDebounced] = useState(amount);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inputRef = useRef({ connection, description });
  inputRef.current = { connection, description };
  /** Lần tạo mới nhất — trả lời của lần cũ hơn bị bỏ (và huỷ mã trên máy chủ). */
  const targetRef = useRef<QrTarget | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Đóng bảng thanh toán khi mã còn chờ tiền → huỷ mã, khách quét mã cũ không vào đâu.
      if (qrPending(stateRef.current)) cancelQrPayment(stateRef.current.qr!.id).catch(() => {});
    };
  }, []);

  // Giỏ hàng đổi số lượng / món liên tục → chờ 1 giây mới tạo lại mã.
  useEffect(() => {
    if (amount === debounced) return undefined;
    const timer = setTimeout(() => setDebounced(amount), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [amount, debounced]);

  const create = useCallback(async (target: QrTarget) => {
    const conn = inputRef.current.connection;
    if (!conn) return;
    const previous = stateRef.current;
    if (qrPending(previous)) cancelQrPayment(previous.qr!.id).catch(() => {});
    targetRef.current = target;
    dispatch({ type: 'create', target });
    try {
      const qr = await createQrPayment({
        connectionId: conn.id,
        ...(conn.bankAccountId ? { bankAccountId: conn.bankAccountId } : {}),
        amount: target.amount,
        description: inputRef.current.description?.trim() || undefined,
      });
      if (!mounted.current || !sameTarget(targetRef.current, target)) {
        cancelQrPayment(qr.id).catch(() => {});
        return;
      }
      dispatch({ type: 'created', target, qr });
    } catch (err) {
      if (mounted.current) dispatch({ type: 'failed', target, error: extractApiError(err) });
    }
  }, []);

  // Vào chuyển khoản qua kết nối / đổi tổng tiền / đổi kết nối → tạo mã.
  useEffect(() => {
    if (!active) return;
    const target = { amount: debounced, source };
    if (shouldCreateQr(stateRef.current, target)) void create(target);
  }, [active, debounced, source, create]);

  // Thôi chuyển khoản qua kết nối (đổi cách trả / về theo tài khoản): huỷ mã đang chờ. Đã nhận tiền thì giữ.
  useEffect(() => {
    if (active || stateRef.current.phase === 'completed') return;
    if (qrPending(stateRef.current)) cancelQrPayment(stateRef.current.qr!.id).catch(() => {});
    targetRef.current = null;
    dispatch({ type: 'reset' });
  }, [active]);

  const pollId = state.phase === 'active' ? state.qr?.id : undefined;
  useEffect(() => {
    if (!pollId) return undefined;
    const timer = setInterval(() => {
      getQrPaymentStatus(pollId).then(
        (status) => mounted.current && dispatch({ type: 'status', status }),
        () => {} // lần sau hỏi lại
      );
    }, QR_POLL_MS);
    return () => clearInterval(timer);
  }, [pollId]);

  const check = useCallback(async () => {
    const qr = stateRef.current.qr;
    if (!qr) return;
    setChecking(true);
    try {
      const status = await getQrPaymentStatus(qr.id);
      if (mounted.current) dispatch({ type: 'status', status });
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, []);

  const cancel = useCallback(() => {
    const qr = stateRef.current.qr;
    if (!qr) return;
    dispatch({ type: 'cancelled' });
    cancelQrPayment(qr.id).catch(() => {}); // có thể khách vừa trả xong — máy chủ giữ trạng thái đã trả
  }, []);

  const renew = useCallback(() => {
    void create({ amount, source });
  }, [create, amount, source]);

  return { state, checking, check, cancel, renew };
}

/** Số giây còn lại tới hạn của mã, cập nhật mỗi giây; null = không đếm ngược. */
export function useSecondsLeft(expiresAt: string | null | undefined): number | null {
  const [left, setLeft] = useState(() => secondsUntil(expiresAt));
  useEffect(() => {
    setLeft(secondsUntil(expiresAt));
    if (!expiresAt) return undefined;
    const timer = setInterval(() => setLeft(secondsUntil(expiresAt)), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return left;
}

/** Ảnh mã: qrDataUrl máy chủ trả; không có (hoặc tải lỗi) thì tự vẽ từ qrPayload. */
export function QrCodeImage({ qr, size }: { qr: Pick<IQrPayment, 'qrDataUrl' | 'qrPayload'>; size: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [qr.qrDataUrl]);
  const useUrl = !!qr.qrDataUrl && !failed;
  const matrix = useMemo(() => (useUrl ? null : qrMatrix(qr.qrPayload)), [useUrl, qr.qrPayload]);

  if (useUrl) {
    return <Image source={{ uri: qr.qrDataUrl! }} onError={() => setFailed(true)} style={{ width: size, height: size }} resizeMode="contain" />;
  }
  if (!matrix) {
    return (
      <View className="items-center justify-center" style={{ width: size, height: size }}>
        <Icon name="qrcode-remove" size={40} tone="faint" />
      </View>
    );
  }
  const dim = matrix.size + QR_QUIET_ZONE * 2;
  return (
    <Svg testID="qr-payload-image" width={size} height={size} viewBox={`0 0 ${dim} ${dim}`}>
      <Rect width={dim} height={dim} fill="#FFFFFF" />
      <Path d={qrSvgPath(matrix)} fill="#000000" />
    </Svg>
  );
}

function Notice({ tone, text, children }: { tone: 'warning' | 'error' | 'success'; text: string; children?: ReactNode }) {
  const box = tone === 'success' ? 'bg-success-soft' : tone === 'error' ? 'bg-error-soft' : 'bg-warning-soft';
  const icon = tone === 'success' ? 'check-circle' : 'information-outline';
  return (
    <View className={`self-stretch gap-2.5 rounded-2xl px-3.5 py-3 ${box}`}>
      <View className="flex-row items-start gap-2.5">
        <Icon name={icon} size={18} tone={tone} />
        {tone === 'warning' ? (
          <Text variant="bodySmall" className="flex-1 font-semibold text-warning-text">{text}</Text>
        ) : (
          <Text variant="bodySmall" tone={tone} className="flex-1 font-semibold">{text}</Text>
        )}
      </View>
      {children}
    </View>
  );
}

/** Tên ngắn của nhà cung cấp cho "tiền về qua …". */
const providerName = (c: IPosPaymentConnection) =>
  `${c.displayName || c.provider}${c.environment === 'test' ? ` (${t('erp.sourceTest')})` : ''}`;

export function DynamicQrView({ dyn, total, connection }: { dyn: DynamicQr; total: number; connection: IPosPaymentConnection }) {
  const { state, checking } = dyn;
  const qr = state.qr;
  const secondsLeft = useSecondsLeft(state.phase === 'active' ? qr?.expiresAt : null);

  // Tổng 0đ: không có gì để thu qua mã.
  if (state.phase === 'idle' && total <= 0) return null;
  if (state.phase === 'idle' || state.phase === 'creating') {
    return (
      <View className="items-center gap-2 py-6">
        <Spinner />
        <Text variant="caption" tone="muted">{t('erp.qrCreating')}</Text>
      </View>
    );
  }

  if (state.phase === 'error') {
    return (
      <Notice tone="error" text={state.error || t('erp.qrCreateFailed')}>
        <Button variant="soft" size="sm" icon="refresh" onPress={dyn.renew}>{t('erp.qrRetry')}</Button>
      </Notice>
    );
  }

  if (state.phase === 'cancelled') {
    return (
      <Notice tone="warning" text={t('erp.qrCancelled')}>
        <Button variant="soft" size="sm" icon="qrcode" onPress={dyn.renew}>{t('erp.qrNew')}</Button>
      </Notice>
    );
  }

  if (state.phase === 'expired') {
    return (
      <Notice tone="warning" text={t('erp.qrExpired', { code: qr?.paymentCode ? ` (${qr.paymentCode})` : '' })}>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button variant="soft" size="sm" icon="qrcode" onPress={dyn.renew}>{t('erp.qrNew')}</Button>
          </View>
          <View className="flex-1">
            <Button variant="outline" action="neutral" size="sm" icon="refresh" loading={checking} onPress={dyn.check}>{t('erp.qrCheck')}</Button>
          </View>
        </View>
      </Notice>
    );
  }

  if (state.phase === 'completed' && qr) {
    const paid = qrPaidAmount(qr);
    return (
      <Notice tone="success" text={t('erp.qrPaid', { amount: money(paid) })}>
        <Text variant="caption" tone={paid >= total ? 'muted' : 'error'}>
          {paid >= total ? t('erp.qrPaidHint') : t('erp.qrPaidShort', { total: money(total), paid: money(paid) })}
        </Text>
      </Notice>
    );
  }

  if (!qr) return null;
  const received = qr.amountReceived ?? 0;
  const updating = qr.amount !== total;
  return (
    <View className="gap-2.5 items-center">
      <Text variant="caption" tone={updating ? 'warning' : 'muted'} className="font-semibold">
        {updating ? t('erp.qrUpdating') : t('erp.qrWaiting')}
      </Text>
      <View className="rounded-2xl bg-white p-2" style={{ width: 236, height: 236, opacity: updating ? 0.5 : 1 }}>
        <QrCodeImage qr={qr} size={220} />
      </View>
      <View className="items-center">
        {qr.bankName || qr.accountNumber ? (
          <Text variant="bodySmall" className="font-bold">{[qr.bankName, qr.accountNumber].filter(Boolean).join(' · ')}</Text>
        ) : null}
        {qr.paymentCode ? (
          <>
            <Text variant="caption" tone="muted" className="mt-1">{t('erp.qrPaymentCode')}</Text>
            <Text className="text-[20px] leading-[26px] font-bold" tone="primary" style={{ letterSpacing: 2 }}>{qr.paymentCode}</Text>
          </>
        ) : null}
        {secondsLeft !== null ? (
          <Text variant="caption" tone={secondsLeft <= 60 ? 'warning' : 'muted'} className="mt-0.5">
            {secondsLeft === 0 ? t('erp.qrExpiredShort') : t('erp.qrExpiresIn', { time: formatCountdown(secondsLeft) })}
          </Text>
        ) : null}
      </View>
      {received > 0 && received < qr.amount ? (
        <Notice tone="warning" text={t('erp.qrPartial', { received: money(received), amount: money(qr.amount) })} />
      ) : null}
      <Text variant="caption" tone="muted" className="text-center">{t('erp.qrAutoConfirm', { provider: providerName(connection) })}</Text>
      <View className="flex-row gap-2 self-stretch">
        <View className="flex-1">
          <Button variant="soft" size="sm" icon="refresh" loading={checking} onPress={dyn.check}>{t('erp.qrCheck')}</Button>
        </View>
        <View className="flex-1">
          <Button variant="outline" action="error" size="sm" icon="close" onPress={dyn.cancel}>{t('erp.qrCancel')}</Button>
        </View>
      </View>
      <Text variant="caption" tone="faint">{t('erp.qrAutoCheck', { s: QR_POLL_MS / 1000 })}</Text>
    </View>
  );
}

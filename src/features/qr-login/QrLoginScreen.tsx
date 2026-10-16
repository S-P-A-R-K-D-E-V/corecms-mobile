import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';

import { Screen, SectionCard, ListItem, AppHeader, goBackOrHome } from 'src/components/shared';
import { Text, Button, Icon, Spinner } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { approveQrLogin, inspectQrLogin, rejectQrLogin } from 'src/api/qr-login';
import { extractApiError, hasApiErrorCode } from 'src/services/error';
import { haptics } from 'src/services/haptics';
import { t } from 'src/i18n';
import type { IQrLoginInspectResponse } from 'src/types/corecms-api';
import { parseQrLoginPayload } from './qr-payload';
import { getStore, getStoreCode } from 'src/services/store-config';

// ----------------------------------------------------------------------
// Đăng nhập web bằng mã QR: người đã đăng nhập app quét QR trên trang đăng nhập web (máy tính), XEM trình
// duyệt nào đang xin đăng nhập rồi mới bấm Đồng ý / Từ chối. Quét xong không tự đăng nhập — kẻ gian gửi mã
// của chúng nhờ quét thì người dùng còn một bước để nhận ra. Duyệt xong trình duyệt đó đăng nhập bằng chính
// tài khoản này, phiên web 12 giờ không gia hạn (BE: QrLoginController).

type Mode =
  | { kind: 'scan'; notice?: string }
  | { kind: 'checking' }
  | { kind: 'confirm'; code: string; info: IQrLoginInspectResponse; deciding?: 'approve' | 'reject' }
  | { kind: 'done'; approved: boolean }
  | { kind: 'failed'; message: string };

/** Một QR không phải mã đăng nhập nằm yên trong khung sẽ được đọc liên tục — chỉ báo lại sau khoảng này. */
const SAME_CODE_QUIET_MS = 2500;

function failureMessage(err: unknown): string {
  if (hasApiErrorCode(err, 'Auth.QrLoginWrongStore')) return t('qrLogin.wrongStore');
  if (hasApiErrorCode(err, 'Auth.InvalidQrLoginCode')) return t('qrLogin.expired');
  return extractApiError(err);
}

export function QrLoginScreen() {
  const { user, authenticated } = useAuthContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>({ kind: 'scan' });

  // Camera gọi onBarcodeScanned nhiều lần mỗi giây: khoá ngay khi nhận một mã hợp lệ, và nhớ mã lạ vừa báo.
  const busy = useRef(false);
  const lastRejected = useRef<{ data: string; at: number } | null>(null);

  useEffect(() => {
    if (mode.kind === 'scan' && authenticated && permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [mode.kind, authenticated, permission, requestPermission]);

  function scanAgain() {
    busy.current = false;
    lastRejected.current = null;
    setMode({ kind: 'scan' });
  }

  async function handleScanned(result: BarcodeScanningResult) {
    if (busy.current || !result.data) return;

    const code = parseQrLoginPayload(result.data);
    if (!code) {
      const now = Date.now();
      const last = lastRejected.current;
      if (last && last.data === result.data && now - last.at < SAME_CODE_QUIET_MS) return;
      lastRejected.current = { data: result.data, at: now };
      setMode({ kind: 'scan', notice: t('qrLogin.notLoginCode') });
      return;
    }

    busy.current = true;
    haptics.success();
    setMode({ kind: 'checking' });
    try {
      const info = await inspectQrLogin(code);
      setMode({ kind: 'confirm', code, info });
    } catch (err) {
      setMode({ kind: 'failed', message: failureMessage(err) });
    }
  }

  async function decide(approve: boolean) {
    if (mode.kind !== 'confirm' || mode.deciding) return;
    const { code, info } = mode;
    setMode({ kind: 'confirm', code, info, deciding: approve ? 'approve' : 'reject' });
    try {
      if (approve) await approveQrLogin(code);
      else await rejectQrLogin(code);
      if (approve) haptics.success();
      setMode({ kind: 'done', approved: approve });
    } catch (err) {
      // Từ chối mà không gửi được (mất mạng, mã vừa hết hạn): trình duyệt kia vẫn không được duyệt — coi như
      // đã từ chối. Đồng ý mà lỗi thì phải báo, vì trình duyệt chưa đăng nhập được.
      if (approve) setMode({ kind: 'failed', message: failureMessage(err) });
      else setMode({ kind: 'done', approved: false });
    }
  }

  if (!authenticated) {
    return (
      <Screen tabBarInset={false}>
        <AppHeader title={t('qrLogin.title')} back />
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Icon name="lock-outline" size={48} tone="muted" />
          <Text tone="muted" className="text-center">{t('qrLogin.signInFirst')}</Text>
        </View>
      </Screen>
    );
  }

  if (mode.kind === 'scan') {
    if (!permission?.granted) {
      return (
        <Screen tabBarInset={false}>
          <AppHeader title={t('qrLogin.title')} back />
          <View className="flex-1 items-center justify-center gap-3 px-8">
            <Icon name="camera-off-outline" size={48} tone="muted" />
            <Text tone="muted" className="text-center">{t('qrLogin.cameraDenied')}</Text>
            <Button onPress={requestPermission}>{t('qrLogin.allowCamera')}</Button>
          </View>
        </Screen>
      );
    }
    return (
      <View className="flex-1 bg-black">
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleScanned}
        />
        <View style={StyleSheet.absoluteFill} pointerEvents="none" className="items-center justify-center">
          <View style={{ width: 220, height: 220, borderRadius: 16, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' }} />
        </View>
        <View className="absolute top-14 left-4 right-4 items-center gap-3">
          <Text className="text-white text-center">{t('qrLogin.scanHint')}</Text>
          {mode.notice ? (
            <View className="rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
              <Text variant="bodySmall" className="text-white text-center">{mode.notice}</Text>
            </View>
          ) : null}
        </View>
        <View className="absolute bottom-10 left-4 right-4">
          <Button variant="outline" action="neutral" onPress={goBackOrHome}>{t('common.cancel')}</Button>
        </View>
      </View>
    );
  }

  if (mode.kind === 'checking') {
    return (
      <Screen tabBarInset={false}>
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Spinner />
          <Text tone="muted" className="text-center">{t('qrLogin.checking')}</Text>
        </View>
      </Screen>
    );
  }

  if (mode.kind === 'done') {
    return (
      <Screen tabBarInset={false}>
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Icon name={mode.approved ? 'check-decagram' : 'close-circle-outline'} size={56} tone={mode.approved ? 'success' : 'muted'} />
          <Text variant="title" className="text-center">{t(mode.approved ? 'qrLogin.approved' : 'qrLogin.rejected')}</Text>
          <Text tone="muted" className="text-center">{t(mode.approved ? 'qrLogin.approvedDesc' : 'qrLogin.rejectedDesc')}</Text>
          <Button onPress={goBackOrHome}>{t('common.done')}</Button>
          <Button variant="outline" action="neutral" onPress={scanAgain}>{t('qrLogin.scanAgain')}</Button>
        </View>
      </Screen>
    );
  }

  if (mode.kind === 'failed') {
    return (
      <Screen tabBarInset={false}>
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Icon name="alert-circle-outline" size={56} tone="error" />
          <Text className="text-center">{mode.message}</Text>
          <Button onPress={scanAgain}>{t('qrLogin.scanAgain')}</Button>
          <Button variant="outline" action="neutral" onPress={goBackOrHome}>{t('common.cancel')}</Button>
        </View>
      </Screen>
    );
  }

  // confirm — xem trình duyệt đang xin đăng nhập rồi quyết định.
  const { info, deciding } = mode;
  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader title={t('qrLogin.title')} back />

      <SectionCard title={t('qrLogin.confirmTitle')} bodyClassName="pt-0">
        <Text tone="muted" className="pb-2">{t('qrLogin.confirmAs', { email: user?.email ?? '' })}</Text>
        <ListItem
          icon="web"
          iconTone="primary"
          title={info.host}
          subtitle={
            // Mã của trang đăng nhập chung (auth.…): duyệt xong trình duyệt vào web của cửa hàng app đang mở.
            info.host.startsWith('auth.')
              ? t('qrLogin.hubSite', { store: getStore()?.name ?? getStoreCode() ?? '' })
              : t('qrLogin.site')
          }
        />
        <ListItem icon="monitor" iconTone="secondary" title={info.browser || t('qrLogin.unknown')} subtitle={t('qrLogin.browser')} />
        <ListItem icon="ip-network-outline" iconTone="secondary" title={info.ipAddress || t('qrLogin.unknown')} subtitle={t('qrLogin.ipAddress')} />
      </SectionCard>

      <View className="flex-row gap-2 px-1">
        <Icon name="shield-alert-outline" size={20} tone="warning" />
        <Text variant="bodySmall" tone="muted" className="flex-1">{t('qrLogin.warning')}</Text>
      </View>
      <Text variant="caption" tone="faint" className="px-1">{t('qrLogin.sessionNote')}</Text>

      <View className="gap-2 px-1">
        <Button loading={deciding === 'approve'} disabled={!!deciding} onPress={() => decide(true)}>
          {t('qrLogin.approve')}
        </Button>
        <Button variant="outline" action="error" loading={deciding === 'reject'} disabled={!!deciding} onPress={() => decide(false)}>
          {t('qrLogin.reject')}
        </Button>
      </View>
    </Screen>
  );
}

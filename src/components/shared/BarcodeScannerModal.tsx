import { useEffect, useRef } from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../ui/text';
import { Icon } from '../ui/icon';
import { Button } from '../ui/button';
import { Pressable } from '../ui/pressable';
import { haptics } from 'src/services/haptics';
import { t } from 'src/i18n';

// Mã vạch hàng hoá thường gặp (EAN/UPC trên bao bì, Code128/39 tem tự in) + QR.
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'qr'] as const;

/** Quét mã vạch toàn màn hình; trả mã đầu tiên đọc được rồi đóng (chặn đọc lặp trong lúc đóng). */
export function BarcodeScannerModal({ visible, onClose, onScanned }: { visible: boolean; onClose: () => void; onScanned: (code: string) => void }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  useEffect(() => {
    if (visible) handled.current = false;
    if (visible && permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [visible, permission, requestPermission]);

  function onBarcode(result: BarcodeScanningResult) {
    if (handled.current || !result.data) return;
    handled.current = true;
    haptics.success();
    onScanned(result.data.trim());
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
            onBarcodeScanned={visible ? onBarcode : undefined}
          />
        ) : (
          <View className="flex-1 items-center justify-center px-8 gap-4">
            <Icon name="camera-off-outline" size={40} color="#FFFFFF" />
            <Text tone="inverse" className="text-center">{t('erp.cameraDenied')}</Text>
            <View className="w-56">
              <Button onPress={requestPermission}>{t('erp.allowCamera')}</Button>
            </View>
          </View>
        )}

        {/* Khung ngắm */}
        {permission?.granted ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill} className="items-center justify-center">
            <View style={{ width: 260, height: 160, borderRadius: 18, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' }} />
            <Text tone="inverse" className="mt-4 font-semibold">{t('erp.scanHint')}</Text>
          </View>
        ) : null}

        <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12 }} className="flex-row items-center justify-between">
          <Text tone="inverse" variant="headline">{t('erp.scanTitle')}</Text>
          <Pressable
            onPress={onClose}
            accessibilityLabel={t('common.close')}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

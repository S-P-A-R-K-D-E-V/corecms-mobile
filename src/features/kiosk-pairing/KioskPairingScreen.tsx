import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';

import { Screen, SectionCard, ListItem } from 'src/components/shared';
import { Text, Button, Icon, TextField, Spinner } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { useQuery } from '@tanstack/react-query';
import { getBranchLocations } from 'src/api/attendance';
import { claimKioskPairing } from 'src/api/kiosk';
import { extractApiError } from 'src/services/error';

// ----------------------------------------------------------------------
// Ghép nối thiết bị Kiosk từ app — Admin/Manager quét QR do màn kiosk (web /kiosk-checkin) hiển
// thị, hoặc gõ tay mã 6 số, rồi chọn tên + chi nhánh để xác nhận (KioskPairingController.Claim).
// Thay cho việc phải seed tay KioskDevice qua DB trước đây.

type Mode = 'scan' | 'manual' | 'form' | 'submitting' | 'success' | 'error';

function parseQrPayload(data: string): string | null {
  try {
    const json = JSON.parse(data);
    if (json?.type === 'corecms-kiosk-pair' && typeof json.code === 'string') return json.code;
  } catch {
    // Không phải JSON — có thể chỉ là chuỗi 6 số thô, chấp nhận luôn nếu khớp định dạng.
  }
  if (/^\d{6}$/.test(data.trim())) return data.trim();
  return null;
}

export function KioskPairingScreen() {
  const { user } = useAuthContext();
  const isAdminOrManager =
    user?.role === 'Admin' || user?.role === 'Manager' || (user?.roles ?? []).some((r) => r === 'Admin' || r === 'Manager');

  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('scan');
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);

  const branchesQ = useQuery({ queryKey: ['branches'], queryFn: getBranchLocations, staleTime: 60 * 60 * 1000 });

  useEffect(() => {
    if (mode === 'scan' && !permission?.granted) requestPermission();
  }, [mode, permission?.granted, requestPermission]);

  function handleScanned(result: BarcodeScanningResult) {
    const parsed = parseQrPayload(result.data);
    if (!parsed) return;
    setCode(parsed);
    setMode('form');
  }

  async function handleSubmit() {
    if (!code.trim() || !deviceName.trim() || !branchId) return;
    setMode('submitting');
    setErrorMsg(null);
    try {
      const res = await claimKioskPairing({ code: code.trim(), deviceName: deviceName.trim(), branchId });
      setDeviceLabel(res.deviceName);
      setMode('success');
    } catch (err) {
      setErrorMsg(extractApiError(err));
      setMode('error');
    }
  }

  function reset() {
    setCode('');
    setDeviceName('');
    setBranchId(null);
    setErrorMsg(null);
    setMode('scan');
  }

  if (!isAdminOrManager) {
    return (
      <Screen tabBarInset={false}>
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Icon name="lock-outline" size={48} tone="muted" />
          <Text tone="muted" className="text-center">
            Cần quyền Admin hoặc Quản lý để ghép nối thiết bị kiosk.
          </Text>
        </View>
      </Screen>
    );
  }

  if (mode === 'success') {
    return (
      <Screen tabBarInset={false}>
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Icon name="check-decagram" size={56} tone="success" />
          <Text variant="title" className="text-center">Ghép nối thành công!</Text>
          <Text tone="muted" className="text-center">Thiết bị &quot;{deviceLabel}&quot; đã sẵn sàng dùng chấm công kiosk.</Text>
          <Button onPress={reset}>Ghép nối thiết bị khác</Button>
          <Button variant="outline" action="neutral" onPress={() => router.back()}>Xong</Button>
        </View>
      </Screen>
    );
  }

  if (mode === 'scan') {
    if (!permission?.granted) {
      return (
        <Screen tabBarInset={false}>
          <View className="flex-1 items-center justify-center gap-3 px-8">
            <Icon name="camera-off-outline" size={48} tone="muted" />
            <Text tone="muted" className="text-center">Cần quyền camera để quét mã QR.</Text>
            <Button onPress={requestPermission}>Cấp quyền camera</Button>
            <Button variant="outline" action="neutral" onPress={() => setMode('manual')}>Nhập mã thủ công</Button>
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
        <View className="absolute top-14 left-4 right-4 items-center">
          <Text className="text-white text-center">Đưa mã QR trên màn kiosk vào khung</Text>
        </View>
        <View className="absolute bottom-10 left-4 right-4 gap-2">
          <Button variant="outline" onPress={() => setMode('manual')}>Nhập mã thủ công</Button>
          <Button variant="outline" action="neutral" onPress={() => router.back()}>Huỷ</Button>
        </View>
      </View>
    );
  }

  // manual | form | submitting | error — cùng 1 form, chỉ khác trạng thái nút submit.
  return (
    <Screen scroll tabBarInset={false}>
      <SectionCard title="Ghép nối thiết bị Kiosk" bodyClassName="gap-3">
        <Text tone="muted">Mở /kiosk-checkin trên thiết bị kiosk, nhập mã 6 số hiển thị trên màn hình đó.</Text>
        <TextField
          label="Mã ghép nối"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
        />
        <TextField
          label="Tên thiết bị"
          value={deviceName}
          onChangeText={setDeviceName}
          placeholder="VD: Quầy lễ tân"
        />
      </SectionCard>

      <SectionCard title="Chi nhánh" bodyClassName="pt-0">
        {branchesQ.isLoading ? (
          <View className="py-4 items-center"><Spinner /></View>
        ) : (
          (branchesQ.data ?? []).map((b) => (
            <ListItem
              key={b.id}
              title={b.branchName}
              icon="office-building-outline"
              iconTone={branchId === b.id ? 'primary' : 'muted'}
              right={branchId === b.id ? <Icon name="check-circle" tone="primary" size={20} /> : null}
              onPress={() => setBranchId(b.id)}
            />
          ))
        )}
      </SectionCard>

      {mode === 'error' && errorMsg ? (
        <Text tone="error" className="text-center">{errorMsg}</Text>
      ) : null}

      <View className="gap-2 px-1">
        <Button
          disabled={!code.trim() || !deviceName.trim() || !branchId}
          loading={mode === 'submitting'}
          onPress={handleSubmit}
        >
          Xác nhận ghép nối
        </Button>
        <Button variant="outline" action="neutral" onPress={() => setMode('scan')}>Quét lại bằng QR</Button>
      </View>
    </Screen>
  );
}

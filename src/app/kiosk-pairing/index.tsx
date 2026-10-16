import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { KioskPairingScreen } from 'src/features/kiosk-pairing/KioskPairingScreen';

// Chưa đăng nhập mà mở link ghép kiosk → về đăng nhập (trước đây hiện "cần quyền Admin").
export default function KioskPairing() {
  return (
    <InternalAppGuard>
      <KioskPairingScreen />
    </InternalAppGuard>
  );
}

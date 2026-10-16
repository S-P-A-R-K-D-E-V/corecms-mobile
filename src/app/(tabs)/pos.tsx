import { PosScreen } from 'src/features/pos/PosScreen';
import { FnbFloorScreen } from 'src/features/fnb/FnbFloorScreen';
import { useFnbAccess } from 'src/features/fnb/use-fnb';
import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';

// Chi nhánh đang làm việc là F&B và cửa hàng bật commerce.fnb.pos → sơ đồ bàn; còn lại Bán hàng như trước (chủ cửa hàng
// tắt được trên app theo vai trò — máy quầy không bị tắt).
export default function Pos() {
  const { visible } = useFnbAccess();
  if (visible) return <FnbFloorScreen />;
  return (
    <PlatformFeatureGate feature={PLATFORM_FEATURES.posSale} label="Bán hàng">
      <PosScreen />
    </PlatformFeatureGate>
  );
}

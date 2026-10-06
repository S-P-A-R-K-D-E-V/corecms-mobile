import { PosScreen } from 'src/features/pos/PosScreen';
import { FnbFloorScreen } from 'src/features/fnb/FnbFloorScreen';
import { useFnbAccess } from 'src/features/fnb/use-fnb';

// Chi nhánh đang làm việc là F&B và cửa hàng bật commerce.fnb.pos → sơ đồ bàn; còn lại Bán hàng như trước.
export default function Pos() {
  const { visible } = useFnbAccess();
  return visible ? <FnbFloorScreen /> : <PosScreen />;
}

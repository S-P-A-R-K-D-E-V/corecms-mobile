import { AllFeaturesScreen } from 'src/features/launcher/AllFeaturesScreen';
import { CounterMenuScreen } from 'src/features/counter/CounterMenuScreen';
import { useCounterSession } from 'src/features/counter/use-counter-session';

export default function Features() {
  // Máy quầy: menu rút gọn (tính năng bán hàng + phiên đang dùng máy) thay cho lưới tiện ích.
  return useCounterSession() ? <CounterMenuScreen /> : <AllFeaturesScreen />;
}

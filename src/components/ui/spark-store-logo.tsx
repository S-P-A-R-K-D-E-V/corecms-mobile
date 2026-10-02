import { Text, type TextStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useColorScheme } from 'nativewind';

// ----------------------------------------------------------------------
// Logo S Store (bản cửa hàng): tia chớp trắng bo tròn trên nền hồng — đúng biểu tượng chủ app chọn,
// cùng hình với app icon / splash (assets/store/icon.svg là bản gốc). Vẽ vector trong app thay vì ảnh PNG:
// PNG màu phẳng bị bước nén khi build release đổi sang PNG bảng màu và hiện trống trên màn Chào mừng.
// ----------------------------------------------------------------------

/** Màu thương hiệu S Store — trùng STORE_BRAND_COLOR trong app.config.ts. */
export const SPARK_STORE_BRAND = '#DB4F7A';
/** Màu mận đậm của chữ "S" trong chữ thương hiệu. */
export const SPARK_STORE_PLUM = '#351E2E';

const BOLT = 'M638.36 160.45 L628.03 158.39 L619.08 158.73 L614.26 159.76 L598.77 166.65 L592.57 171.13 L270.98 491.34 L263.75 500.98 L257.89 513.03 L255.83 520.95 L255.48 532.31 L257.21 542.30 L260.99 551.60 L265.81 558.83 L275.80 567.78 L282.34 571.57 L292.33 575.01 L298.52 576.04 L486.86 576.04 L491.34 576.39 L494.78 577.76 L498.23 580.86 L499.26 582.93 L499.95 588.78 L498.23 594.29 L488.59 610.13 L481.36 623.90 L436.94 700.69 L382.88 796.06 L381.16 801.23 L380.47 806.39 L380.82 812.59 L381.85 816.03 L385.64 823.26 L390.46 828.43 L392.87 830.15 L399.06 832.90 L403.54 833.94 L412.84 833.59 L418.35 831.87 L425.92 827.39 L579.14 673.83 L636.99 614.61 L748.20 498.23 L751.99 492.72 L754.74 487.21 L757.50 476.54 L757.50 468.62 L755.09 459.66 L751.99 453.81 L746.82 447.27 L740.97 442.79 L733.05 439.00 L722.38 436.94 L570.53 436.94 L568.81 436.59 L564.68 434.18 L561.58 430.05 L560.89 427.64 L560.89 422.82 L562.27 418.69 L661.09 216.58 L663.84 208.31 L664.88 201.08 L664.88 194.54 L663.50 186.96 L660.75 179.73 L656.61 173.19 L652.14 168.37 L646.63 164.24 Z';

/** Icon app: nền hồng bo góc (như icon trên màn hình chính) + tia chớp trắng. */
export function SparkStoreIcon({ size = 84, radius = 0.2237 }: { size?: number; radius?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Rect width={1024} height={1024} rx={1024 * radius} fill={SPARK_STORE_BRAND} />
      <Path d={BOLT} fill="#FFFFFF" />
    </Svg>
  );
}

/** Chỉ tia chớp (splash trong app, nền màu do màn hình đặt). */
export function SparkStoreBolt({ size = 120, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Path d={BOLT} fill={color} />
    </Svg>
  );
}

/**
 * Chữ thương hiệu "S Store": "S" mận đậm, "Store" hồng. Chế độ tối: "S" chuyển màu sáng để đọc được trên nền
 * tối. Dùng riêng hoặc lồng trong một <Text> khác (vd "Chào mừng đến với S Store").
 */
export function SStoreWordmark({ style }: { style?: TextStyle }) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  return (
    <Text style={style}>
      <Text style={{ color: dark ? '#F6E7EE' : SPARK_STORE_PLUM }}>S</Text>
      {/* Khoảng trắng không ngắt dòng: "S Store" luôn đi liền. */}
      <Text style={{ color: SPARK_STORE_BRAND }}>{' '}Store</Text>
    </Text>
  );
}

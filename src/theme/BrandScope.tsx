import { useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useColorScheme, vars } from 'nativewind';

import { SPARK_STORE_BRAND } from 'src/components/ui/spark-store-logo';
import { buildPrimaryPalette, paletteVars, useBrandColor } from './brand-color';

/**
 * Gắn lại biến màu cửa hàng (--color-primary*) cho cây con. Root layout đã gắn một lần, nhưng Modal
 * (Sheet, hộp thoại) render ra ngoài cây DOM trên web → class `bg-primary`… rơi về màu mặc định (hồng
 * CiCi). Bọc nội dung Modal bằng BrandScope để luôn đúng màu cửa hàng.
 */
export function BrandScope({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const palette = useBrandColor((s) => s.palette);
  const brandVars = useMemo(() => vars(paletteVars(palette)), [palette]);
  return <View style={[{ flex: 1 }, brandVars, style]}>{children}</View>;
}

// Màn của nền tảng (Chào mừng, tìm / chọn cửa hàng, đăng nhập email chung): luôn hồng Spark Store. Cửa hàng
// vừa dùng vẫn được nhớ (để "Quay lại …") nên màu toàn cục còn là màu cửa hàng đó — không đổi màu toàn cục ở
// đây vì root layout dựng lại navigator theo màu (mất màn đang mở).
const PLATFORM_PALETTE = buildPrimaryPalette(SPARK_STORE_BRAND);
const PLATFORM_VARS = vars(paletteVars(PLATFORM_PALETTE));

/** Gắn màu Spark Store cho các class bg-primary / text-primary… của cây con. */
export function PlatformBrandScope({ children }: { children: React.ReactNode }) {
  return <View style={[{ flex: 1 }, PLATFORM_VARS]}>{children}</View>;
}

/** Mã hex hồng Spark Store theo sáng / tối — cho Icon, Spinner (đọc màu hex chứ không đọc class). */
export function usePlatformPrimary(): string {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? PLATFORM_PALETTE.dark : PLATFORM_PALETTE.main;
}

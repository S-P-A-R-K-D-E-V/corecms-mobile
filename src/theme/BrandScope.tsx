import { useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import { vars } from 'nativewind';

import { paletteVars, useBrandColor } from './brand-color';

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

import { LinearGradient } from 'expo-linear-gradient';
import type { ViewStyle } from 'react-native';
import { cn } from './utils';
import { getPrimaryPalette } from 'src/theme/brand-color';

export type BrandGradientProps = {
  children?: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  /** Subtle brand sheen by default; 'deep' for darker premium banners. */
  variant?: 'brand' | 'deep' | 'transparent';
  /** Chuyển màu theo chiều ngang (không đổi theo chiều dọc) — hai khối xếp chồng ghép liền không lộ mép. */
  horizontal?: boolean;
};

/** Màu đọc lúc render — theo cửa hàng đang mở (brand-color.ts). */
function palettes(): Record<string, [string, string, ...string[]]> {
  const p = getPrimaryPalette();
  return {
    // Soft brand sheen — Apple-calm, only for hero / banner surfaces.
    brand: [p[400], p.main, p[700]],
    deep: ['#3A2330', '#241A22', '#17131A'],
    transparent: ['transparent', p.main, p[700]],
  };
}

/** Gentle brand gradient for hero cards / banners (used sparingly). */
export function BrandGradient({ children, className, style, variant = 'brand', horizontal }: BrandGradientProps) {
  return (
    <LinearGradient
      colors={palettes()[variant]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: horizontal ? 0 : 1 }}
      style={style}
      className={cn('overflow-hidden', className)}
    >
      {children}
    </LinearGradient>
  );
}

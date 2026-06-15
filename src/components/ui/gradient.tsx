import { LinearGradient } from 'expo-linear-gradient';
import type { ViewStyle } from 'react-native';
import { cn } from './utils';

export type BrandGradientProps = {
  children?: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  /** Subtle brand sheen by default; 'deep' for darker premium banners. */
  variant?: 'brand' | 'deep' | 'transparent';
};

const PALETTES: Record<string, [string, string, ...string[]]> = {
  // Soft rose sheen — Apple-calm, only for hero / banner surfaces.
  brand: ['#D86A88', '#C84D71', '#A83C5D'],
  deep: ['#3A2330', '#241A22', '#17131A'],
  transparent: ['transparent', '#C84D71', '#A83C5D'],
};

/** Gentle brand gradient for hero cards / banners (used sparingly). */
export function BrandGradient({ children, className, style, variant = 'brand' }: BrandGradientProps) {
  return (
    <LinearGradient
      colors={PALETTES[variant]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
      className={cn('overflow-hidden', className)}
    >
      {children}
    </LinearGradient>
  );
}

import { useWindowDimensions } from 'react-native';

/** dp threshold — matches Android's sw600dp tablet bucket and the shortest
 *  side of even the smallest iPad (iPad mini: 744pt). */
export const TABLET_BREAKPOINT = 600;

/** Single source of truth for tablet/orientation decisions. Reactive to
 *  rotation and iPad Split View/Slide Over resizes (unlike `Dimensions.get`). */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isLandscape: width > height,
    isTablet: Math.min(width, height) >= TABLET_BREAKPOINT,
  };
}

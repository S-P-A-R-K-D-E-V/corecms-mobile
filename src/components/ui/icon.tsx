import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import { brand } from 'src/theme';
import { SOLAR_ICONS } from './solar-registry';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Tone = 'default' | 'muted' | 'faint' | 'primary' | 'secondary' | 'error' | 'success' | 'warning' | 'info' | 'inverse';

const toneColor: Record<Tone, string> = {
  default: brand.ink,
  muted: brand.muted,
  faint: brand.faint,
  primary: brand.primary,
  secondary: brand.secondary,
  error: brand.error,
  success: brand.success,
  warning: brand.warning,
  info: brand.info,
  inverse: '#FFFFFF',
};

export type IconProps = {
  name: IconName;
  size?: number;
  tone?: Tone;
  color?: string;
};

/**
 * Icon resolves color from brand tones. Icons present in the Solar registry
 * (Iconify Solar — the same set core-fe / Minimal uses) render as crisp SVGs;
 * anything not yet mapped falls back to MaterialCommunityIcons.
 */
export function Icon({ name, size = 22, tone = 'default', color }: IconProps) {
  const tint = color ?? toneColor[tone];
  const xml = SOLAR_ICONS[name];
  if (xml) {
    return <SvgXml xml={xml} width={size} height={size} color={tint} />;
  }
  return <MaterialCommunityIcons name={name} size={size} color={tint} />;
}

export type { IconName };

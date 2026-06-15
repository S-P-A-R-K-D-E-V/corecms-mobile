import { MaterialCommunityIcons } from '@expo/vector-icons';
import { brand } from 'src/theme';

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

/** Wrapper over MaterialCommunityIcons that resolves color from brand tones. */
export function Icon({ name, size = 22, tone = 'default', color }: IconProps) {
  return <MaterialCommunityIcons name={name} size={size} color={color ?? toneColor[tone]} />;
}

export type { IconName };

import { ActivityIndicator } from 'react-native';
import { brand } from 'src/theme';

export function Spinner({ size = 'small', color }: { size?: 'small' | 'large'; color?: string }) {
  return <ActivityIndicator size={size} color={color ?? brand.primary} />;
}

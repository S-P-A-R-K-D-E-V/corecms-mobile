import { Image, View } from 'react-native';

import { Text } from 'src/components/ui';

/** Logo cửa hàng, hoặc chữ cái đầu trên nền màu thương hiệu khi chưa có logo. */
export function StoreAvatar({
  name,
  logoUrl,
  color,
  size = 44,
}: {
  name?: string | null;
  logoUrl?: string | null;
  color?: string | null;
  size?: number;
}) {
  const radius = Math.round(size * 0.28);
  if (logoUrl) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#F4F6F8' }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  const initials = (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <View
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: color || '#C84D71' }}
      className="items-center justify-center"
    >
      <Text className="text-white font-bold" style={{ fontSize: Math.round(size * 0.38) }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

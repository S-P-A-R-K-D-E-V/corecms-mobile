import { useState } from 'react';
import { View, Image } from 'react-native';

import { Text } from 'src/components/ui';
import { getStorageUrl } from 'src/api/axios';

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

type Props = {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  online?: boolean;
};

/** Avatar nhân viên: hiện ảnh từ R2 (objectKey → /media), fallback chữ cái đầu. */
export function ChatAvatar({ name, avatarUrl, size = 48, online }: Props) {
  const [failed, setFailed] = useState(false);
  const uri = avatarUrl ? getStorageUrl(avatarUrl) : '';
  const showImage = !!uri && !failed;
  const dot = Math.max(10, Math.round(size * 0.28));

  return (
    <View style={{ width: size, height: size }}>
      {showImage ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View
          className="rounded-full bg-primary-50 dark:bg-[rgba(200,77,113,0.18)] items-center justify-center"
          style={{ width: size, height: size }}
        >
          <Text className="text-primary font-bold" style={{ fontSize: Math.round(size * 0.36) }}>
            {initialsOf(name)}
          </Text>
        </View>
      )}
      {online ? (
        <View
          className="absolute bottom-0 right-0 rounded-full bg-primary border-2 border-surface dark:border-surface-dark"
          style={{ width: dot, height: dot }}
        />
      ) : null}
    </View>
  );
}

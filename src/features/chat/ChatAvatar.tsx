import { useState } from 'react';
import { View, Image } from 'react-native';

import { Icon, Text, type IconName } from 'src/components/ui';
import { getStorageUrl } from 'src/api/axios';

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

type Props = {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  online?: boolean;
  /** Hội thoại / người gửi hệ thống: icon (robot / chuông) thay ảnh và chữ cái đầu. */
  icon?: IconName | null;
};

/** Avatar nhân viên: hiện ảnh từ R2 (objectKey → /media), fallback chữ cái đầu; hệ thống hiện icon. */
export function ChatAvatar({ name, avatarUrl, size = 48, online, icon }: Props) {
  const [failed, setFailed] = useState(false);
  const uri = avatarUrl ? getStorageUrl(avatarUrl) : '';
  const showImage = !!uri && !failed;
  const dot = Math.max(10, Math.round(size * 0.28));

  return (
    <View style={{ width: size, height: size }}>
      {icon ? (
        <View
          className="rounded-full bg-secondary-soft items-center justify-center"
          style={{ width: size, height: size }}
        >
          <Icon name={icon} size={Math.round(size * 0.52)} tone="secondary" />
        </View>
      ) : showImage ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View
          className="rounded-full bg-primary-50 dark:bg-primary/20 items-center justify-center"
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

import { useState } from 'react';
import { View, Image } from 'react-native';
import { MotiView } from 'moti';
import { Text } from './text';
import { cn } from './utils';

function initialsOf(name?: string) {
  return (name ?? '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

export type AvatarProps = {
  name?: string;
  /** Fully-resolved image URL. */
  uri?: string | null;
  size?: number;
  online?: boolean;
  className?: string;
};

/** Circular avatar: image with fade-in + initials fallback + presence dot. */
export function Avatar({ name, uri, size = 48, online, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const show = !!uri && !failed;
  const dot = Math.max(10, Math.round(size * 0.26));

  return (
    <View style={{ width: size, height: size }} className={className}>
      <View
        className="rounded-full overflow-hidden bg-primary-50 dark:bg-[rgba(200,77,113,0.18)] items-center justify-center"
        style={{ width: size, height: size }}
      >
        {show ? (
          <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 250 }} style={{ width: '100%', height: '100%' }}>
            <Image source={{ uri: uri! }} onError={() => setFailed(true)} style={{ width: '100%', height: '100%' }} />
          </MotiView>
        ) : (
          <Text className="text-primary font-bold" style={{ fontSize: Math.round(size * 0.36) }}>
            {initialsOf(name)}
          </Text>
        )}
      </View>
      {online ? (
        <View
          className={cn('absolute bottom-0 right-0 rounded-full bg-success border-2 border-surface dark:border-surface-dark')}
          style={{ width: dot, height: dot }}
        />
      ) : null}
    </View>
  );
}

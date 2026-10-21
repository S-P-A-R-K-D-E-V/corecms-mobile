import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, Button, Icon } from '../ui';
import { brand } from 'src/theme';
import { t } from 'src/i18n';
import { openStoreListing } from 'src/services/app-update/required-version';

/** Màn chặn toàn app khi bản đang cài đã ngừng hỗ trợ — chỉ còn nút mở chợ để cập nhật. */
export function UpdateRequired({ version }: { version: string | null }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 items-center justify-center px-8 gap-4 bg-bg dark:bg-bg-dark"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="w-20 h-20 rounded-full items-center justify-center bg-primary/10">
        <Icon name="cellphone-arrow-down" size={40} color={brand.primary} />
      </View>
      <Text variant="title2" className="text-center">
        {t('appUpdate.title')}
      </Text>
      <Text tone="muted" className="text-center leading-5">
        {t('appUpdate.message', { version: version ?? '' })}
      </Text>
      <View style={{ width: '100%', maxWidth: 320, marginTop: 8 }}>
        <Button icon="download" onPress={() => void openStoreListing()}>
          {t('appUpdate.button')}
        </Button>
      </View>
    </View>
  );
}

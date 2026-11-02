import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAnnouncementImageUrl } from 'src/api/announcements';
import { getStorageUrl } from 'src/api/axios';
import { Icon, Text } from 'src/components/ui';
import { t } from 'src/i18n';

import { FALLBACK_IMAGE_RATIO, imageRatio } from './announcement-logic';

// ----------------------------------------------------------------------
// Ảnh đính kèm của thông báo. Dùng Image của React Native, không thêm thư viện gốc để phát được bằng OTA. Link ký có hạn nên popup mở lâu có
// thể gặp link hết hạn: lỗi lần đầu thì xin link mới một lần. Vẫn lỗi thì báo và cho thử lại, chữ và nút "Đã hiểu" không bị ảnh hưởng.
// ----------------------------------------------------------------------

export type ZoomedImage = { uri: string; ratio: number };

type Props = {
  announcementId: string;
  url: string;
  title: string;
  onZoom: (image: ZoomedImage) => void;
};

export function AnnouncementImage({ announcementId, url, title, onZoom }: Props) {
  const [uri, setUri] = useState(() => getStorageUrl(url));
  const [ratio, setRatio] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const refreshed = useRef(false);

  const handleError = async () => {
    if (!refreshed.current) {
      refreshed.current = true;
      const fresh = await getAnnouncementImageUrl(announcementId).catch(() => null);
      if (fresh && getStorageUrl(fresh) !== uri) {
        setUri(getStorageUrl(fresh));
        return;
      }
    }
    setFailed(true);
  };

  if (failed) {
    return (
      <View className="mt-3 flex-row items-center gap-2 rounded-xl border border-line dark:border-line-dark p-3">
        <Icon name="image-off-outline" size={20} tone="muted" />
        <Text tone="muted" className="flex-1 text-[13px]">
          {t('announcement.imageFailed')}
        </Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            refreshed.current = false;
            setFailed(false);
            setAttempt((a) => a + 1);
          }}
        >
          <Text className="font-bold text-[13px]">{t('announcement.imageRetry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      testID="announcement-image"
      className="mt-3"
      accessibilityRole="imagebutton"
      accessibilityLabel={t('announcement.imageAlt', { title })}
      accessibilityHint={t('announcement.imageZoom')}
      disabled={!ratio}
      onPress={() => ratio && onZoom({ uri, ratio })}
    >
      {/* Chưa biết tỉ lệ thì giữ khung tạm: ảnh cao 0 thì Android không tải. */}
      <Image
        key={attempt}
        source={{ uri }}
        resizeMode="contain"
        style={{ width: '100%', aspectRatio: ratio ?? FALLBACK_IMAGE_RATIO, borderRadius: 12 }}
        onLoad={(e) => setRatio(imageRatio(e.nativeEvent.source?.width, e.nativeEvent.source?.height) ?? FALLBACK_IMAGE_RATIO)}
        onError={handleError}
      />
      {!ratio ? (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Xem toàn màn hình, đặt trong cùng Modal với popup. Cuộn dọc; iOS chụm được để phóng to (ScrollView của Android không hỗ trợ). */
export function ZoomedAnnouncementImage({ image, title, onClose }: { image: ZoomedImage; title: string; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <View testID="announcement-image-zoom" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }}>
      <ScrollView maximumZoomScale={4} minimumZoomScale={1} showsVerticalScrollIndicator contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <Image
          source={{ uri: image.uri }}
          resizeMode="contain"
          accessibilityLabel={t('announcement.imageAlt', { title })}
          style={{ width, height: width / image.ratio }}
        />
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('announcement.imageClose')}
        hitSlop={8}
        onPress={onClose}
        className="absolute right-4 w-10 h-10 rounded-full items-center justify-center"
        style={{ top: insets.top + 12, backgroundColor: 'rgba(0,0,0,0.6)' }}
      >
        <Icon name="close" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

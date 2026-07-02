import { useRef, useState } from 'react';
import { Modal, View, Image, ScrollView, FlatList, useWindowDimensions, StatusBar, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, Icon, Pressable } from 'src/components/ui';

// ----------------------------------------------------------------------
// Trình xem ảnh toàn màn hình trong app (KHÔNG mở browser). Dùng component
// lõi RN để an toàn tuyệt đối với New Architecture / build hiện tại:
//   - FlatList ngang + pagingEnabled: vuốt qua nhiều ảnh.
//   - Mỗi ảnh bọc trong ScrollView maximumZoomScale: pinch-zoom gốc (iOS),
//     double-tap-less nhưng mượt; Android hỗ trợ zoom cơ bản.
// ----------------------------------------------------------------------

export type ViewerImage = { uri: string; fileName?: string };

export function ImageViewer({
  images,
  initialIndex = 0,
  visible,
  onClose,
}: {
  images: ViewerImage[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<ViewerImage>>(null);

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  }

  const current = images[index];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item }) => (
            <ScrollView
              style={{ width, height }}
              contentContainerStyle={{ width, height, alignItems: 'center', justifyContent: 'center' }}
              maximumZoomScale={3}
              minimumZoomScale={1}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              pinchGestureEnabled
            >
              <Image source={{ uri: item.uri }} style={{ width, height }} resizeMode="contain" />
            </ScrollView>
          )}
        />

        {/* Thanh trên: đóng + đếm + tên tệp */}
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 6, paddingHorizontal: 12 }}
        >
          <View className="flex-row items-center gap-3">
            <Pressable onPress={onClose} hitSlop={10} className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
              <Icon name="close" size={24} color="#fff" />
            </Pressable>
            <View className="flex-1">
              {current?.fileName ? (
                <Text className="text-white font-semibold" numberOfLines={1}>{current.fileName}</Text>
              ) : null}
              {images.length > 1 ? (
                <Text className="text-white/70 text-[12px]">{index + 1} / {images.length}</Text>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

import { useEffect } from 'react';
import { View, BackHandler } from 'react-native';
import { router } from 'expo-router';

import { Screen, AppHeader } from 'src/components/shared';
import { Text, Icon, Pressable } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';

import { PersonalInfoForm } from '../account/PersonalInfoForm';

/** Màn bắt buộc bổ sung hồ sơ cá nhân — mở khi đăng nhập mà thiếu SĐT/địa
 *  chỉ/ngân hàng/ảnh CCCD. Không có nút back, chặn cả nút back cứng Android;
 *  chỉ có lối thoát duy nhất là hoàn tất form hoặc đăng xuất. */
export function CompleteProfileScreen() {
  const { logout } = useAuthContext();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  function handleDone() {
    router.replace('/');
  }

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader title="Hoàn tất hồ sơ" />
      <View className="gap-4">
        <View className="rounded-2xl bg-primary/10 border border-primary/20 p-4 flex-row gap-3">
          <Icon name="information-outline" size={20} tone="primary" />
          <Text variant="footnote" tone="muted" className="flex-1">
            Vui lòng bổ sung đầy đủ thông tin bên dưới (số điện thoại, địa chỉ, ngân hàng nhận
            lương và ảnh CCCD) trước khi tiếp tục sử dụng ứng dụng.
          </Text>
        </View>

        <PersonalInfoForm variant="onboarding" onDone={handleDone} />

        <Pressable onPress={logout} className="items-center py-2">
          <Text variant="footnote" tone="faint">Đăng xuất</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

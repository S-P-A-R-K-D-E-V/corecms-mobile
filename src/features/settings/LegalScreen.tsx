import { useLocalSearchParams } from 'expo-router';

import { Screen, AppHeader } from 'src/components/shared';
import { Card, Text } from 'src/components/ui';
import { t } from 'src/i18n';

type Doc = 'privacy' | 'terms' | 'licenses';

const CONTENT: Record<Doc, { title: string; body: string }> = {
  privacy: {
    title: t('settings.privacy'),
    body:
      'CoreCMS Mobile thu thập vị trí (GPS) và ảnh khuôn mặt chỉ nhằm mục đích xác thực chấm công theo yêu cầu của doanh nghiệp. ' +
      'Dữ liệu được lưu trữ an toàn trên hệ thống nội bộ và không chia sẻ cho bên thứ ba ngoài mục đích vận hành nhân sự.\n\n' +
      'Bạn có thể yêu cầu xoá dữ liệu cá nhân bằng cách liên hệ quản trị viên doanh nghiệp.',
  },
  terms: {
    title: t('settings.terms'),
    body:
      'Ứng dụng dành cho nhân viên đã được cấp tài khoản bởi doanh nghiệp. ' +
      'Mọi thao tác check-in/out, đăng ký ca, đổi ca và yêu cầu chấm công đều được ghi nhận và có thể dùng để tính lương. ' +
      'Vui lòng không chia sẻ tài khoản và sử dụng đúng mục đích công việc.',
  },
  licenses: {
    title: t('settings.licenses'),
    body:
      'Ứng dụng sử dụng các thư viện mã nguồn mở: React Native, Expo, NativeWind, Gluestack UI, ' +
      'React Query, Zustand, dayjs, và @microsoft/signalr. Giấy phép của từng thư viện tuân theo điều khoản tương ứng (MIT/Apache-2.0).',
  },
};

export function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc?: Doc }>();
  const content = CONTENT[(doc ?? 'privacy') as Doc] ?? CONTENT.privacy;

  return (
    <Screen scroll>
      <AppHeader title={content.title} back />
      <Card className="p-5">
        <Text className="leading-6">{content.body}</Text>
      </Card>
    </Screen>
  );
}

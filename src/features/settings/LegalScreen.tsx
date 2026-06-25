import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Screen, AppHeader } from 'src/components/shared';
import { Card, Text } from 'src/components/ui';
import { t } from 'src/i18n';

type Doc = 'privacy' | 'terms' | 'licenses';

type Section = { heading?: string; body: string };

const CONTENT: Record<Doc, { title: string; updatedAt: string; sections: Section[] }> = {
  privacy: {
    title: t('settings.privacy'),
    updatedAt: '24/06/2026',
    sections: [
      {
        heading: '1. Thông tin chúng tôi thu thập',
        body:
          '• Thông tin tài khoản: họ tên, email, ảnh đại diện (khi đăng nhập qua Google/Facebook).\n' +
          '• Vị trí (GPS): khi bạn chấm công (check-in/check-out), dùng để xác minh bạn đang ở đúng địa điểm làm việc.\n' +
          '• Ảnh khuôn mặt: chụp khi chấm công để đối chiếu, xác thực danh tính người chấm công.\n' +
          '• Ảnh đại diện: nếu bạn chọn cập nhật ảnh đại diện, ứng dụng cần quyền truy cập thư viện ảnh.\n' +
          '• Dữ liệu nghiệp vụ: ca làm việc, chấm công, bảng lương và các dữ liệu bạn nhập vào hệ thống.',
      },
      {
        heading: '2. Mục đích sử dụng',
        body:
          '• Xác minh vị trí và đối chiếu ảnh khuôn mặt khi chấm công để chống gian lận chấm công.\n' +
          '• Vận hành, duy trì và cải thiện các tính năng của ứng dụng.\n' +
          '• Xác thực danh tính và bảo mật tài khoản người dùng.\n' +
          '• Gửi thông báo liên quan đến ca làm việc, chấm công, bảng lương.\n' +
          '• Hỗ trợ kỹ thuật và tuân thủ các yêu cầu pháp lý hiện hành.',
      },
      {
        heading: '3. Face ID',
        body:
          'Face ID được dùng để đăng nhập nhanh hơn và được xử lý hoàn toàn cục bộ trên thiết bị ' +
          '(Secure Enclave của Apple). Chúng tôi không thu thập, không truyền và không lưu trữ dữ liệu sinh trắc học này trên server.',
      },
      {
        heading: '4. Chia sẻ thông tin',
        body:
          'Dữ liệu chỉ phục vụ mục đích vận hành nhân sự của doanh nghiệp bạn đang làm việc. Chúng tôi không bán, ' +
          'trao đổi hoặc chia sẻ thông tin cá nhân cho bên thứ ba ngoài mục đích này, trừ khi pháp luật yêu cầu.',
      },
      {
        heading: '5. Lưu trữ & bảo mật',
        body:
          'Dữ liệu truyền tải được mã hoá HTTPS/TLS, mật khẩu được băm (hash) và không lưu dưới dạng văn bản thuần. ' +
          'Ảnh xác thực khuôn mặt và vị trí chấm công được lưu trữ phục vụ đối soát công, gắn với thời gian lưu trữ dữ liệu chấm công/bảng lương liên quan.',
      },
      {
        heading: '6. Quyền của bạn & liên hệ',
        body:
          'Bạn có thể yêu cầu xem, chỉnh sửa hoặc xoá dữ liệu cá nhân bằng cách liên hệ quản trị viên doanh nghiệp ' +
          'hoặc support@cici21chualang.vn. Xem chính sách đầy đủ tại cici21chualang.vn/privacy-policy.',
      },
    ],
  },
  terms: {
    title: t('settings.terms'),
    updatedAt: '24/06/2026',
    sections: [
      {
        heading: '1. Phạm vi áp dụng',
        body:
          'Ứng dụng dành cho nhân viên đã được doanh nghiệp cấp tài khoản. Việc sử dụng ứng dụng đồng nghĩa ' +
          'bạn đã đọc và chấp nhận các điều khoản dưới đây.',
      },
      {
        heading: '2. Trách nhiệm của bạn',
        body:
          '• Bảo mật thông tin đăng nhập, không chia sẻ tài khoản cho người khác sử dụng.\n' +
          '• Sử dụng ứng dụng đúng mục đích công việc: check-in/out, đăng ký ca, đổi/làm hộ ca, xem bảng lương.\n' +
          '• Cung cấp thông tin chấm công (vị trí, ảnh khuôn mặt) trung thực, đúng thời điểm làm việc thực tế.',
      },
      {
        heading: '3. Ghi nhận dữ liệu',
        body:
          'Mọi thao tác chấm công, đăng ký/đổi ca đều được hệ thống ghi nhận và có thể dùng làm căn cứ tính lương ' +
          'hoặc xử lý vi phạm nội quy theo quy định của doanh nghiệp.',
      },
      {
        heading: '4. Tạm ngưng dịch vụ',
        body:
          'Doanh nghiệp hoặc chúng tôi có thể tạm ngưng hoặc khoá tài khoản nếu phát hiện hành vi gian lận chấm công, ' +
          'chia sẻ tài khoản hoặc vi phạm các điều khoản này.',
      },
      {
        heading: '5. Thay đổi điều khoản',
        body:
          'Điều khoản có thể được cập nhật theo thời gian; chúng tôi sẽ thông báo qua ứng dụng hoặc email khi có thay đổi ' +
          'quan trọng. Tiếp tục sử dụng ứng dụng sau khi thay đổi có hiệu lực đồng nghĩa bạn chấp nhận điều khoản mới.',
      },
      {
        heading: '6. Liên hệ',
        body: 'Mọi thắc mắc vui lòng liên hệ quản trị viên doanh nghiệp hoặc support@cici21chualang.vn.',
      },
    ],
  },
  licenses: {
    title: t('settings.licenses'),
    updatedAt: '24/06/2026',
    sections: [
      {
        body: 'Toàn bộ thư viện mã nguồn mở dưới đây được phân phối theo Giấy phép MIT.',
      },
      {
        heading: 'Nền tảng & framework',
        body: 'React, React Native, Expo, expo-router, babel-preset-expo',
      },
      {
        heading: 'Điều hướng & bố cục',
        body: 'react-native-screens, react-native-safe-area-context, react-native-svg',
      },
      {
        heading: 'Dữ liệu & trạng thái',
        body: '@tanstack/react-query, zustand, immer, axios, dayjs',
      },
      {
        heading: 'Giao diện & hiệu ứng',
        body:
          'nativewind, tailwindcss, moti, react-native-reanimated, react-native-worklets, ' +
          'expo-blur, expo-linear-gradient, @expo/vector-icons',
      },
      {
        heading: 'Tính năng thiết bị',
        body:
          'expo-camera, expo-location, expo-image-picker, expo-secure-store, expo-notifications, ' +
          'expo-auth-session, expo-web-browser, expo-linking, expo-constants, expo-asset, expo-font, ' +
          'expo-splash-screen, expo-status-bar, expo-updates, expo-dev-client, ' +
          '@react-native-async-storage/async-storage, react-native-view-shot',
      },
      {
        heading: 'Kết nối thời gian thực',
        body: '@microsoft/signalr',
      },
    ],
  },
};

export function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc?: Doc }>();
  const content = CONTENT[(doc ?? 'privacy') as Doc] ?? CONTENT.privacy;

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader title={content.title} back />
      <Card className="p-5 gap-4">
        <Text variant="caption" tone="muted">
          Cập nhật lần cuối: {content.updatedAt}
        </Text>
        {content.sections.map((section, index) => (
          <View key={section.heading ?? index} className="gap-1">
            {section.heading ? <Text variant="headline">{section.heading}</Text> : null}
            <Text className="leading-6">{section.body}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

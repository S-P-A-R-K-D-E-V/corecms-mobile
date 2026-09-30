import type { Locale } from 'src/i18n';

// ----------------------------------------------------------------------
// Chính sách & điều khoản của bản cửa hàng (toàn cầu) — trung tính, không gắn CiCi. Cửa hàng (doanh
// nghiệp mời bạn) là bên quyết định dữ liệu; nhà cung cấp nền tảng xử lý thay cửa hàng. Email hỗ trợ và
// đường dẫn chính sách đầy đủ lấy từ biến build (EXPO_PUBLIC_SUPPORT_EMAIL / EXPO_PUBLIC_PRIVACY_URL);
// chưa đặt thì chỉ hướng dẫn liên hệ quản trị viên cửa hàng.
// ----------------------------------------------------------------------

export type LegalDoc = 'privacy' | 'terms' | 'licenses';
export type LegalSection = { heading?: string; body: string };
export type LegalContent = { title: string; updatedAt: string; sections: LegalSection[] };

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL;
const UPDATED = '2026-10-01';

const LICENSES_BODY = {
  platform: 'React, React Native, Expo, expo-router, babel-preset-expo',
  layout: 'react-native-screens, react-native-safe-area-context, react-native-svg',
  data: '@tanstack/react-query, zustand, immer, axios, dayjs',
  ui:
    'nativewind, tailwindcss, moti, react-native-reanimated, react-native-worklets, ' +
    'expo-blur, expo-linear-gradient, @expo/vector-icons',
  device:
    'expo-camera, expo-location, expo-image-picker, expo-secure-store, expo-notifications, ' +
    'expo-apple-authentication, expo-crypto, expo-auth-session, expo-web-browser, expo-linking, ' +
    'expo-constants, expo-asset, expo-font, expo-splash-screen, expo-status-bar, expo-updates, ' +
    '@react-native-async-storage/async-storage, react-native-view-shot',
  realtime: '@microsoft/signalr',
};

function contactEn(): string {
  const parts = ['Contact your store administrator'];
  if (SUPPORT_EMAIL) parts.push(`or ${SUPPORT_EMAIL}`);
  let text = `${parts.join(' ')}.`;
  if (PRIVACY_URL) text += ` Full policy: ${PRIVACY_URL}.`;
  return text;
}

function contactVi(): string {
  const parts = ['Liên hệ quản trị viên cửa hàng'];
  if (SUPPORT_EMAIL) parts.push(`hoặc ${SUPPORT_EMAIL}`);
  let text = `${parts.join(' ')}.`;
  if (PRIVACY_URL) text += ` Chính sách đầy đủ: ${PRIVACY_URL}.`;
  return text;
}

function english(): Record<LegalDoc, LegalContent> {
  return {
    privacy: {
      title: 'Privacy Policy',
      updatedAt: UPDATED,
      sections: [
        {
          heading: '1. Who is responsible',
          body:
            'This app is used by businesses (stores) to run their teams. The store that invited you decides what data is ' +
            'collected about you and why; we operate the platform and process that data on the store’s behalf.',
        },
        {
          heading: '2. What we collect',
          body:
            '• Account: name, email, profile photo; Sign in with Apple / Google identifiers when you use them.\n' +
            '• Location (GPS): only when you check in/out or count the cash drawer, to confirm you are at the store.\n' +
            '• Face photos: taken at check-in and during face enrollment to verify it is really you.\n' +
            '• Work data: shifts, attendance, pay, requests, chat messages and anything you enter in the app.\n' +
            '• Device: push-notification token, app version and crash diagnostics.',
        },
        {
          heading: '3. How we use it',
          body:
            '• Verify check-ins and prevent attendance fraud.\n' +
            '• Show your schedule and pay, and send notifications about them.\n' +
            '• Secure your account and keep the service running.',
        },
        {
          heading: '4. AI assistant',
          body:
            'If your store turns on the AI assistant, the questions you type and the store data needed to answer them are ' +
            'sent to an AI service provider to generate the answer. The assistant only reads data; it never changes it. ' +
            'The app asks for your permission before you use it the first time. Avoid typing sensitive personal information.',
        },
        {
          heading: '5. Sharing',
          body:
            'We do not sell personal data. Data is shared only with the store you work for, the service providers that run ' +
            'the platform (hosting, notifications, AI when enabled), or when the law requires it.',
        },
        {
          heading: '6. Security & retention',
          body:
            'Data is encrypted in transit (HTTPS/TLS) and passwords are hashed. Check-in photos and locations are kept as ' +
            'long as the related attendance and payroll records.',
        },
        {
          heading: '7. Your choices',
          body:
            'You can view and edit your profile in the app, and delete your account under Me → Delete account. ' +
            contactEn(),
        },
      ],
    },
    terms: {
      title: 'Terms of Use',
      updatedAt: UPDATED,
      sections: [
        {
          heading: '1. Who can use the app',
          body: 'People invited by a store (owners, managers and staff). By using the app you accept these terms.',
        },
        {
          heading: '2. Your responsibilities',
          body:
            '• Keep your sign-in private and do not share your account.\n' +
            '• Use the app for work: check-in/out, shifts, swaps, pay and team chat.\n' +
            '• Provide truthful check-in data (location, face photo) at the time you actually work.',
        },
        {
          heading: '3. Records',
          body:
            'Check-ins, shift changes and other actions are recorded and may be used by your store for payroll or to ' +
            'handle policy violations.',
        },
        {
          heading: '4. AI answers',
          body:
            'AI assistant answers are generated automatically from your store’s data and may be incomplete or wrong. ' +
            'Double-check important numbers before acting on them.',
        },
        {
          heading: '5. Suspension',
          body: 'Your store or we may suspend an account used for attendance fraud, account sharing or breaking these terms.',
        },
        {
          heading: '6. Changes & contact',
          body: 'We may update these terms and will tell you about important changes in the app. ' + contactEn(),
        },
      ],
    },
    licenses: {
      title: 'Open-source licenses',
      updatedAt: UPDATED,
      sections: [
        { body: 'The open-source libraries below are distributed under the MIT License.' },
        { heading: 'Platform & framework', body: LICENSES_BODY.platform },
        { heading: 'Navigation & layout', body: LICENSES_BODY.layout },
        { heading: 'Data & state', body: LICENSES_BODY.data },
        { heading: 'UI & motion', body: LICENSES_BODY.ui },
        { heading: 'Device features', body: LICENSES_BODY.device },
        { heading: 'Real-time', body: LICENSES_BODY.realtime },
      ],
    },
  };
}

function vietnamese(): Record<LegalDoc, LegalContent> {
  return {
    privacy: {
      title: 'Chính sách bảo mật',
      updatedAt: UPDATED,
      sections: [
        {
          heading: '1. Ai chịu trách nhiệm',
          body:
            'Ứng dụng được các doanh nghiệp (cửa hàng) dùng để quản lý đội ngũ. Cửa hàng mời bạn quyết định dữ liệu nào ' +
            'được thu thập và vì sao; chúng tôi vận hành nền tảng và xử lý dữ liệu thay cho cửa hàng.',
        },
        {
          heading: '2. Thông tin thu thập',
          body:
            '• Tài khoản: họ tên, email, ảnh đại diện; định danh Sign in with Apple / Google khi bạn dùng.\n' +
            '• Vị trí (GPS): chỉ khi chấm công hoặc kiểm tiền quầy, để xác nhận bạn đang ở cửa hàng.\n' +
            '• Ảnh khuôn mặt: chụp khi chấm công và khi đăng ký khuôn mặt để xác thực đúng người.\n' +
            '• Dữ liệu công việc: ca làm, chấm công, lương, yêu cầu, tin nhắn và mọi thông tin bạn nhập.\n' +
            '• Thiết bị: mã nhận thông báo, phiên bản ứng dụng và thông tin lỗi.',
        },
        {
          heading: '3. Mục đích sử dụng',
          body:
            '• Xác minh chấm công, chống gian lận.\n' +
            '• Hiển thị lịch làm, lương và gửi thông báo liên quan.\n' +
            '• Bảo mật tài khoản và duy trì dịch vụ.',
        },
        {
          heading: '4. Trợ lý AI',
          body:
            'Khi cửa hàng bật trợ lý AI, câu hỏi bạn nhập và dữ liệu cửa hàng cần để trả lời được gửi tới nhà cung cấp ' +
            'dịch vụ AI để tạo câu trả lời. Trợ lý chỉ đọc dữ liệu, không thay đổi gì. Ứng dụng xin phép bạn trước lần dùng ' +
            'đầu tiên. Không nên nhập thông tin cá nhân nhạy cảm.',
        },
        {
          heading: '5. Chia sẻ',
          body:
            'Chúng tôi không bán dữ liệu cá nhân. Dữ liệu chỉ được chia sẻ với cửa hàng bạn làm việc, các nhà cung cấp vận ' +
            'hành nền tảng (lưu trữ, thông báo, AI khi được bật), hoặc khi pháp luật yêu cầu.',
        },
        {
          heading: '6. Bảo mật & lưu trữ',
          body:
            'Dữ liệu được mã hoá khi truyền (HTTPS/TLS), mật khẩu được băm. Ảnh và vị trí chấm công được lưu cùng thời hạn ' +
            'với bảng công, bảng lương liên quan.',
        },
        {
          heading: '7. Quyền của bạn',
          body:
            'Bạn có thể xem và sửa hồ sơ trong ứng dụng, và xoá tài khoản tại Tôi → Xoá tài khoản. ' + contactVi(),
        },
      ],
    },
    terms: {
      title: 'Điều khoản sử dụng',
      updatedAt: UPDATED,
      sections: [
        {
          heading: '1. Ai được dùng ứng dụng',
          body: 'Người được cửa hàng mời (chủ, quản lý, nhân viên). Sử dụng ứng dụng nghĩa là bạn chấp nhận các điều khoản này.',
        },
        {
          heading: '2. Trách nhiệm của bạn',
          body:
            '• Giữ bí mật thông tin đăng nhập, không chia sẻ tài khoản.\n' +
            '• Dùng đúng mục đích công việc: chấm công, ca làm, đổi ca, lương, nhắn tin nội bộ.\n' +
            '• Cung cấp thông tin chấm công (vị trí, ảnh khuôn mặt) trung thực, đúng lúc làm việc thực tế.',
        },
        {
          heading: '3. Ghi nhận dữ liệu',
          body:
            'Chấm công, thay đổi ca và các thao tác khác được ghi nhận; cửa hàng có thể dùng làm căn cứ tính lương hoặc xử ' +
            'lý vi phạm nội quy.',
        },
        {
          heading: '4. Câu trả lời của AI',
          body:
            'Câu trả lời của trợ lý AI được tạo tự động từ dữ liệu cửa hàng và có thể thiếu hoặc sai. Hãy kiểm tra lại số ' +
            'liệu quan trọng trước khi quyết định.',
        },
        {
          heading: '5. Tạm khoá',
          body: 'Cửa hàng hoặc chúng tôi có thể khoá tài khoản gian lận chấm công, chia sẻ tài khoản hoặc vi phạm điều khoản.',
        },
        {
          heading: '6. Thay đổi & liên hệ',
          body: 'Điều khoản có thể được cập nhật; thay đổi quan trọng sẽ được thông báo trong ứng dụng. ' + contactVi(),
        },
      ],
    },
    licenses: {
      title: 'Giấy phép mã nguồn mở',
      updatedAt: UPDATED,
      sections: [
        { body: 'Các thư viện mã nguồn mở dưới đây được phân phối theo Giấy phép MIT.' },
        { heading: 'Nền tảng & framework', body: LICENSES_BODY.platform },
        { heading: 'Điều hướng & bố cục', body: LICENSES_BODY.layout },
        { heading: 'Dữ liệu & trạng thái', body: LICENSES_BODY.data },
        { heading: 'Giao diện & hiệu ứng', body: LICENSES_BODY.ui },
        { heading: 'Tính năng thiết bị', body: LICENSES_BODY.device },
        { heading: 'Kết nối thời gian thực', body: LICENSES_BODY.realtime },
      ],
    },
  };
}

export function storeLegal(locale: Locale, doc: LegalDoc): LegalContent {
  const all = locale === 'vi' ? vietnamese() : english();
  return all[doc] ?? all.privacy;
}

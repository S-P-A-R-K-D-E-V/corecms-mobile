import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';

import enLocale from './locales/en.json';

// Chuỗi xin quyền iOS (khoá NS…) nằm trong nhánh "ios" — Android không nhận (lint coi là ExtraTranslation).
const en = enLocale.ios;

// ----------------------------------------------------------------------
// Hai bản build từ cùng mã nguồn (app.json là cấu hình gốc = bản CiCi):
//
//   APP_VARIANT không đặt / "cici"  → trả nguyên app.json. Bản CiCi không đổi gì.
//   APP_VARIANT=store              → app cửa hàng SaaS bản toàn cầu: tên, bundle id, scheme, phiên bản
//                                     riêng; tiếng Anh làm gốc + tiếng Việt (chuỗi xin quyền iOS dịch qua
//                                     `locales`); Sign in with Apple native; màn Chào mừng tự tìm cửa hàng.
//
// Tên/bundle id/scheme/phiên bản của bản cửa hàng đặt qua biến môi trường (eas.json → profile store-*),
// để đổi tên thương mại không phải sửa code. Scheme phải khớp danh sách cho phép trong core-fe
// (src/auth/utils/mobile-redirect.ts).
// ----------------------------------------------------------------------

const STORE_APP_NAME = process.env.STORE_APP_NAME ?? 'Spark Store';
const STORE_BUNDLE_ID = process.env.STORE_BUNDLE_ID ?? 'com.devbyspark.store';
const STORE_APP_SCHEME = process.env.STORE_APP_SCHEME ?? 'sparkstore';
const STORE_APP_VERSION = process.env.STORE_APP_VERSION ?? '1.0.0';
// Firebase (FCM) cho thông báo đẩy Android của bản cửa hàng (app com.devbyspark.store trong Firebase console). EAS: biến
// môi trường kiểu file GOOGLE_SERVICES_JSON; máy local: ./google-services.store.json. Không có → Android không có push
// (mã máy quầy vẫn hiện trong app khi mở — CounterApprovalWatcher).
const STORE_GOOGLE_SERVICES =
  process.env.GOOGLE_SERVICES_JSON ?? (existsSync('./google-services.store.json') ? './google-services.store.json' : undefined);
/** Ảnh thương hiệu của bản cửa hàng (assets/store/: icon.svg là bản gốc vector — tia chớp trắng trên nền hồng). */
const STORE_ASSETS = './assets/store';
/** Màu thương hiệu Spark Store: nền icon, splash, màu icon thông báo. Sau đăng nhập app vẫn đổi theo màu cửa hàng. */
const STORE_BRAND_COLOR = '#DB4F7A';

type Plugin = NonNullable<ExpoConfig['plugins']>[number];

/**
 * Chuỗi xin quyền của plugin (Android dùng; iOS: plugin GHI ĐÈ infoPlist) — tiếng Anh cho bản toàn cầu, bản
 * dịch tiếng Việt qua `locales`. Khoá nào thiếu, plugin vị trí tự điền câu chung chung "Allow $(PRODUCT_NAME) to
 * access your location" → đặt đủ cả 3 khoá, kể cả "Always" dù app chỉ xin quyền khi đang mở (không gọi
 * requestBackgroundPermissionsAsync), và đè câu tiếng Việt của bản CiCi trong app.json.
 */
const STORE_PLUGIN_TEXT: Record<string, Record<string, string>> = {
  'expo-location': {
    locationWhenInUsePermission: en.NSLocationWhenInUseUsageDescription,
    locationAlwaysAndWhenInUsePermission: en.NSLocationAlwaysAndWhenInUseUsageDescription,
    locationAlwaysPermission: en.NSLocationAlwaysUsageDescription,
  },
  'expo-camera': {
    cameraPermission: en.NSCameraUsageDescription,
    microphonePermission: en.NSMicrophoneUsageDescription,
  },
  'expo-notifications': { icon: `${STORE_ASSETS}/notification-icon.png`, color: STORE_BRAND_COLOR },
};

/** Splash: nền màu thương hiệu + tia chớp trắng ở giữa (sáng/tối như nhau). */
const STORE_SPLASH = {
  image: `${STORE_ASSETS}/splash-icon.png`,
  imageWidth: 180,
  resizeMode: 'contain',
  backgroundColor: STORE_BRAND_COLOR,
  dark: { image: `${STORE_ASSETS}/splash-icon.png`, backgroundColor: STORE_BRAND_COLOR },
} as const;

/**
 * Phần cứng app dùng được nhưng KHÔNG bắt buộc. Không khai báo thì CH Play tự suy ra là bắt buộc — từ quyền
 * (CAMERA → camera sau, RECORD_AUDIO → micro, vị trí) và từ màn quét mã của Google bị khoá dọc
 * (screen.portrait) — rồi ẩn app với máy thiếu một trong số đó, vd. máy POS để bàn màn hình ngang, không camera sau.
 */
const OPTIONAL_ANDROID_FEATURES = [
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.camera.front',
  'android.hardware.microphone',
  'android.hardware.location',
  'android.hardware.location.gps',
  'android.hardware.location.network',
  'android.hardware.screen.portrait',
];

const withOptionalHardware: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const declared = manifest['uses-feature'] ?? [];
    const names = new Set(declared.map((feature) => feature.$['android:name']));
    manifest['uses-feature'] = [
      ...declared,
      ...OPTIONAL_ANDROID_FEATURES.filter((name) => !names.has(name)).map((name) => ({
        $: { 'android:name': name, 'android:required': 'false' as const },
      })),
    ];
    return mod;
  });

function storePlugins(plugins: ExpoConfig['plugins'] = []): Plugin[] {
  return plugins.map((plugin) => {
    if (!Array.isArray(plugin) || plugin.length < 2) return plugin;
    const [name, options] = plugin as [string, Record<string, unknown>];
    const text = STORE_PLUGIN_TEXT[name];
    return text ? ([name, { ...options, ...text }] as Plugin) : plugin;
  });
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  if (process.env.APP_VARIANT !== 'store') return base;

  return {
    ...base,
    name: STORE_APP_NAME,
    scheme: STORE_APP_SCHEME,
    version: STORE_APP_VERSION,
    // OTA (EAS Update, kênh store-*) chỉ tới bản build cùng phiên bản app — không dùng chung "54.0.0" cố định với
    // CiCi, để bản cập nhật JS không rơi vào bản build cũ thiếu module native mới. Bản build có native mới thì
    // tăng STORE_APP_VERSION.
    runtimeVersion: { policy: 'appVersion' },
    icon: `${STORE_ASSETS}/icon.png`,
    splash: { image: STORE_SPLASH.image, resizeMode: 'contain', backgroundColor: STORE_BRAND_COLOR },
    locales: {
      en: './locales/en.json',
      vi: './locales/vi.json',
    },
    ios: {
      ...base.ios,
      bundleIdentifier: STORE_BUNDLE_ID,
      usesAppleSignIn: true,
      infoPlist: {
        ...base.ios?.infoPlist,
        ...en,
        CFBundleDevelopmentRegion: 'en',
        CFBundleAllowMixedLocalizations: true,
      },
    },
    android: {
      ...base.android,
      package: STORE_BUNDLE_ID,
      adaptiveIcon: { foregroundImage: `${STORE_ASSETS}/adaptive-icon.png`, backgroundColor: STORE_BRAND_COLOR },
      ...(STORE_GOOGLE_SERVICES ? { googleServicesFile: STORE_GOOGLE_SERVICES } : {}),
    },
    plugins: [
      ...storePlugins(base.plugins),
      'expo-apple-authentication',
      ['expo-splash-screen', STORE_SPLASH],
      withOptionalHardware as unknown as Plugin,
    ],
    extra: {
      ...base.extra,
      appVariant: 'store',
      appleSignIn: true,
    },
  };
};

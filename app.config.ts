import type { ConfigContext, ExpoConfig } from 'expo/config';

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
/** Ảnh thương hiệu của bản cửa hàng (assets/store/: icon.svg là bản gốc vector — tia chớp trắng trên nền hồng). */
const STORE_ASSETS = './assets/store';
/** Màu thương hiệu Spark Store: nền icon, splash, màu icon thông báo. Sau đăng nhập app vẫn đổi theo màu cửa hàng. */
const STORE_BRAND_COLOR = '#DB4F7A';

type Plugin = NonNullable<ExpoConfig['plugins']>[number];

/** Chuỗi xin quyền của plugin (Android dùng; iOS lấy từ infoPlist/locales) — tiếng Anh cho bản toàn cầu. */
const STORE_PLUGIN_TEXT: Record<string, Record<string, string>> = {
  'expo-location': { locationAlwaysAndWhenInUsePermission: en.NSLocationAlwaysAndWhenInUseUsageDescription },
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
    },
    plugins: [...storePlugins(base.plugins), 'expo-apple-authentication', ['expo-splash-screen', STORE_SPLASH]],
    extra: {
      ...base.extra,
      appVariant: 'store',
      appleSignIn: true,
    },
  };
};

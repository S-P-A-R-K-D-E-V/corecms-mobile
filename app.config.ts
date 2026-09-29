import type { ConfigContext, ExpoConfig } from 'expo/config';

// ----------------------------------------------------------------------
// Hai bản build từ cùng mã nguồn (app.json là cấu hình gốc = bản CiCi):
//
//   APP_VARIANT không đặt / "cici"  → trả nguyên app.json. Bản CiCi không đổi gì.
//   APP_VARIANT=store              → app trung tính cho cửa hàng SaaS: tên, bundle id, scheme riêng,
//                                     màn nhập mã cửa hàng, Sign in with Apple native.
//
// Tên/bundle id/scheme của bản cửa hàng đặt qua biến môi trường (eas.json → profile store-*), để
// đổi tên thương mại không phải sửa code. Scheme phải khớp danh sách cho phép trong core-fe
// (src/auth/utils/mobile-redirect.ts).
// ----------------------------------------------------------------------

const STORE_APP_NAME = process.env.STORE_APP_NAME ?? 'Spark Store';
const STORE_BUNDLE_ID = process.env.STORE_BUNDLE_ID ?? 'com.devbyspark.store';
const STORE_APP_SCHEME = process.env.STORE_APP_SCHEME ?? 'sparkstore';

/** Thay chữ "CiCi" trong các câu xin quyền bằng tên app cửa hàng. */
function neutral(text: unknown): unknown {
  return typeof text === 'string' ? text.replace(/CiCi/g, STORE_APP_NAME) : text;
}

function neutralPlugins(plugins: ExpoConfig['plugins'] = []): ExpoConfig['plugins'] {
  return plugins.map((plugin) => {
    if (!Array.isArray(plugin) || plugin.length < 2) return plugin;
    const [name, options] = plugin as [string, unknown];
    if (!options || typeof options !== 'object') return plugin;
    return [name, Object.fromEntries(Object.entries(options).map(([k, v]) => [k, neutral(v)]))] as [string, unknown];
  });
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  if (process.env.APP_VARIANT !== 'store') return base;

  const infoPlist = Object.fromEntries(
    Object.entries(base.ios?.infoPlist ?? {}).map(([k, v]) => [k, neutral(v)])
  );

  return {
    ...base,
    name: STORE_APP_NAME,
    scheme: STORE_APP_SCHEME,
    ios: {
      ...base.ios,
      bundleIdentifier: STORE_BUNDLE_ID,
      usesAppleSignIn: true,
      infoPlist,
    },
    android: {
      ...base.android,
      package: STORE_BUNDLE_ID,
    },
    plugins: [...(neutralPlugins(base.plugins) ?? []), 'expo-apple-authentication'],
    extra: {
      ...base.extra,
      appVariant: 'store',
      appleSignIn: true,
    },
  };
};

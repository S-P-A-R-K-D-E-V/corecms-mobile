const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Bản web (chỉ dùng để xem trước giao diện): moti/framer-motion import `tslib` dạng ESM, Metro lấy
// nhầm bản CommonJS → "Cannot destructure property '__extends' of 'tslib.default'". iOS/Android không đổi.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'tslib') {
    return { filePath: require.resolve('tslib/tslib.es6.js'), type: 'sourceFile' };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });

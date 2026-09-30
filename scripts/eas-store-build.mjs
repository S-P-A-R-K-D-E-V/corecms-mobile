#!/usr/bin/env node
// ----------------------------------------------------------------------
// Build bản cửa hàng (APP_VARIANT=store) bằng EAS mà không đụng tới build CiCi.
//
// Repo commit sẵn thư mục android/ (bản vá tay của app CiCi, package com.corecms.mobile). Khi thấy
// android/, EAS coi dự án là native và BỎ QUA app.config.ts → APK bản cửa hàng sẽ mang package +
// chữ ký của CiCi (cài lên máy sẽ ghi đè app CiCi). Script này tạm tạo .easignore = .gitignore +
// /android /ios để EAS tự sinh native code từ app.config.ts (package com.devbyspark.store, icon, quyền
// song ngữ…), chạy `eas build`, rồi xoá .easignore.
//
//   node scripts/eas-store-build.mjs android                 # profile store-preview (APK)
//   node scripts/eas-store-build.mjs ios store-production    # TestFlight
//   (tham số thêm sau profile được chuyển thẳng cho eas build, vd --non-interactive --no-wait)
// ----------------------------------------------------------------------
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const [platform = 'android', profile = 'store-preview', ...rest] = process.argv.slice(2);
if (!['android', 'ios', 'all'].includes(platform)) {
  console.error('platform phải là android | ios | all');
  process.exit(1);
}
if (!profile.startsWith('store-')) {
  console.error('Chỉ dùng cho profile store-* (bản CiCi build như cũ).');
  process.exit(1);
}
if (existsSync('.easignore')) {
  console.error('.easignore đã tồn tại — kiểm tra lại trước khi chạy (script sẽ ghi đè rồi xoá nó).');
  process.exit(1);
}

const gitignore = readFileSync('.gitignore', 'utf8');
writeFileSync(
  '.easignore',
  `${gitignore}\n# Tạm thời (scripts/eas-store-build.mjs): để EAS sinh native code từ app.config.ts cho bản cửa hàng.\n/android\n/ios\n`
);

try {
  const result = spawnSync('npx', ['-y', 'eas-cli@latest', 'build', '--platform', platform, '--profile', profile, ...rest], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, APP_VARIANT: 'store' },
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync('.easignore', { force: true });
}

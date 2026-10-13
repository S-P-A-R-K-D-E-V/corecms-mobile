#!/usr/bin/env node
// ----------------------------------------------------------------------
// Gửi bản iOS của app cửa hàng (Spark Store, com.devbyspark.store) lên App Store Connect / TestFlight.
//
// Dự án EAS dùng chung với app CiCi (com.corecms.mobile) → luôn chỉ đích danh build bằng --id, KHÔNG dùng
// --latest (dễ gửi nhầm IPA của CiCi), và luôn đặt APP_VARIANT=store để eas-cli đọc đúng bundle id từ
// app.config.ts. Cần profile submit "store-production" (ascAppId của app Spark Store trên App Store Connect)
// trong eas.json — chủ app tạo app trên App Store Connect rồi điền.
//
//   npm run submit:store:ios -- --id <buildId>
//   npm run submit:store:android -- --id <buildId>   (Google Play: gửi thẳng vào kênh Phát hành công khai, phát hành đầy
//     đủ và gửi Google xem xét ngay — xem eas.json; EAS phải có khoá service account được cấp quyền phát hành app này)
//
// Giống script build: repo commit sẵn android/ của app CiCi, nên nếu không che thư mục đó thì eas-cli đọc package
// com.corecms.mobile và dùng nhầm khoá Google Play của CiCi. Script tạm tạo .easignore (/android, /ios) rồi xoá.
//   (tham số thêm được chuyển thẳng cho eas submit, vd --non-interactive)
// ----------------------------------------------------------------------
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// Tham số đầu: ios (mặc định) | android.
const raw = process.argv.slice(2);
const platform = raw[0] === 'android' || raw[0] === 'ios' ? raw.shift() : 'ios';
const args = raw;
if (!args.includes('--id')) {
  console.error('Thiếu --id <buildId> (lấy ở trang build EAS). Không gửi theo --latest vì dự án EAS dùng chung với CiCi.');
  process.exit(1);
}
if (args.includes('--latest')) {
  console.error('Không dùng --latest cho bản cửa hàng.');
  process.exit(1);
}
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
if (platform === 'ios' && !eas.submit?.['store-production']?.ios?.ascAppId) {
  console.error('eas.json chưa có submit.store-production.ios.ascAppId của app Spark Store trên App Store Connect.');
  process.exit(1);
}
if (platform === 'android' && !eas.submit?.['store-production']?.android) {
  console.error('eas.json chưa có submit.store-production.android (track, releaseStatus).');
  process.exit(1);
}

if (existsSync('.easignore')) {
  console.error('.easignore đã tồn tại — kiểm tra lại trước khi chạy (script sẽ ghi đè rồi xoá nó).');
  process.exit(1);
}
writeFileSync(
  '.easignore',
  `${readFileSync('.gitignore', 'utf8')}
# Tạm thời (scripts/eas-store-submit.mjs): để eas-cli đọc package của bản cửa hàng từ app.config.ts.
/android
/ios
`
);

try {
  const result = spawnSync(
    'npx',
    ['-y', 'eas-cli@latest', 'submit', '--platform', platform, '--profile', 'store-production', ...args],
    { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, APP_VARIANT: 'store' } }
  );
  process.exitCode = result.status ?? 1;
} finally {
  rmSync('.easignore', { force: true });
}

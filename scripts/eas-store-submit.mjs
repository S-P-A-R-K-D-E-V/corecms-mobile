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
//   npm run submit:store:android -- --id <buildId>   (Google Play: app phải được tạo sẵn trên Play Console, bản AAB
//     đầu tiên tải lên bằng tay, và EAS có khoá service account của Google Play)
//   (tham số thêm được chuyển thẳng cho eas submit, vd --non-interactive)
// ----------------------------------------------------------------------
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Tham số đầu: ios (mặc định) | android. Android gửi vào kênh Internal testing ở dạng nháp (eas.json).
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

const result = spawnSync(
  'npx',
  ['-y', 'eas-cli@latest', 'submit', '--platform', platform, '--profile', 'store-production', ...args],
  { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, APP_VARIANT: 'store' } }
);
process.exitCode = result.status ?? 1;

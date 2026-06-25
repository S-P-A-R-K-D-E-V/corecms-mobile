// Dev-only generator: pulls the real Solar (minimals.cc style) icon bodies from
// the Iconify API and writes src/components/ui/solar-registry.ts. Not bundled.
import fs from 'node:fs';
import path from 'node:path';

// MCI icon name (used across the app) -> Solar icon name (Iconify `solar:` set).
// Style: bold-duotone for feature icons, linear for nav/outline accents.
const MAP = {
  // nav / common
  'chevron-left': 'alt-arrow-left-linear',
  'chevron-right': 'alt-arrow-right-linear',
  'chevron-up': 'alt-arrow-up-linear',
  'chevron-down': 'alt-arrow-down-linear',
  'arrow-right': 'arrow-right-linear',
  'close': 'close-circle-linear',
  'plus': 'add-circle-bold-duotone',
  'check': 'check-circle-bold-duotone',
  'check-bold': 'check-circle-bold',
  'check-all': 'check-read-bold-duotone',
  'check-circle': 'check-circle-bold-duotone',
  'check-circle-outline': 'check-circle-linear',
  'close-circle': 'close-circle-bold-duotone',
  'check-decagram': 'verified-check-bold-duotone',
  'alert': 'danger-triangle-bold-duotone',
  'alert-circle': 'danger-circle-bold-duotone',
  'alert-circle-outline': 'danger-circle-linear',
  'alert-outline': 'danger-triangle-linear',
  'information': 'info-circle-bold-duotone',
  'refresh': 'refresh-bold-duotone',
  'magnify': 'magnifer-linear',
  'send': 'plain-2-bold-duotone',
  'paperclip': 'paperclip-linear',
  'download': 'download-minimalistic-bold-duotone',
  'pencil-outline': 'pen-bold-duotone',
  'trash-can-outline': 'trash-bin-minimalistic-bold-duotone',
  'content-save-outline': 'diskette-bold-duotone',
  'history': 'history-bold-duotone',
  'cog-outline': 'settings-bold-duotone',
  'logout': 'logout-2-bold-duotone',
  'login': 'login-2-bold-duotone',
  'web': 'global-bold-duotone',
  'code-tags': 'code-bold-duotone',
  // bell
  'bell-outline': 'bell-bold-duotone',
  'bell-cog-outline': 'bell-bing-bold-duotone',
  // tabs
  'calendar-blank-outline': 'calendar-linear',
  'wallet-outline': 'wallet-bold-duotone',
  'face-recognition': 'face-scan-circle-bold-duotone',
  'message-outline': 'chat-round-line-bold-duotone',
  'account-circle-outline': 'user-circle-bold-duotone',
  // calendar family
  'calendar': 'calendar-bold-duotone',
  'calendar-check': 'calendar-mark-bold-duotone',
  'calendar-clock': 'calendar-bold-duotone',
  'calendar-today': 'calendar-date-bold-duotone',
  'calendar-plus': 'calendar-add-bold-duotone',
  'calendar-remove-outline': 'calendar-minimalistic-linear',
  'calendar-sync-outline': 'calendar-bold-duotone',
  // clock / time
  'clock-outline': 'clock-circle-bold-duotone',
  'clock-plus-outline': 'clock-circle-bold-duotone',
  'clock-in': 'login-3-bold-duotone',
  'clock-out': 'logout-3-bold-duotone',
  'timer-sand': 'hourglass-bold-duotone',
  // camera
  'camera': 'camera-bold-duotone',
  'camera-outline': 'camera-linear',
  'camera-account': 'camera-bold-duotone',
  'camera-flip': 'camera-rotate-bold-duotone',
  'camera-retake': 'restart-bold',
  'camera-check': 'camera-bold-duotone',
  // map / gps
  'map-marker-outline': 'map-point-linear',
  'map-marker-check': 'map-point-bold-duotone',
  'map-marker-off': 'map-point-remove-bold-duotone',
  'map-marker-radius': 'map-point-wave-bold-duotone',
  // money / cash
  'cash': 'banknote-bold-duotone',
  'cash-multiple': 'wad-of-money-bold-duotone',
  'cash-register': 'wad-of-money-bold-duotone',
  'cash-sync': 'banknote-2-bold-duotone',
  'cash-remove': 'bill-cross-bold-duotone',
  'calculator-variant-outline': 'calculator-bold-duotone',
  'wallet': 'wallet-bold-duotone',
  'credit-card-outline': 'card-bold-duotone',
  'card-account-details-outline': 'card-2-bold-duotone',
  'bank-outline': 'banknote-2-bold-duotone',
  'receipt': 'bill-list-bold-duotone',
  // store / shop
  'store': 'shop-2-bold-duotone',
  'store-outline': 'shop-2-linear',
  'shopping-outline': 'cart-large-2-bold-duotone',
  // charts
  'chart-bar': 'chart-2-bold-duotone',
  'chart-donut': 'pie-chart-2-bold-duotone',
  // lock / shield
  'lock-outline': 'lock-keyhole-bold-duotone',
  'lock-open-variant-outline': 'lock-keyhole-unlocked-bold-duotone',
  'shield-key-outline': 'shield-keyhole-bold-duotone',
  'shield-lock-outline': 'shield-keyhole-minimalistic-bold-duotone',
  // profile / account
  'account-edit-outline': 'user-id-bold-duotone',
  'account-group-outline': 'users-group-rounded-bold-duotone',
  'account-arrow-right-outline': 'user-plus-bold-duotone',
  'square-edit-outline': 'pen-new-square-bold-duotone',
  'pencil': 'pen-bold-duotone',
  // settings / appearance
  'palette-outline': 'palette-bold-duotone',
  'white-balance-sunny': 'sun-bold-duotone',
  'weather-night': 'moon-bold-duotone',
  'cellphone-cog': 'smartphone-update-bold-duotone',
  'vibrate': 'smartphone-vibration-bold-duotone',
  'volume-high': 'volume-loud-bold-duotone',
  // contact
  'email-outline': 'letter-bold-duotone',
  'phone-outline': 'phone-bold-duotone',
  // docs / files
  'file-document-outline': 'document-text-bold-duotone',
  'clipboard-text-outline': 'clipboard-text-bold-duotone',
  'image-multiple-outline': 'gallery-bold-duotone',
  // misc
  'lightning-bolt': 'bolt-bold-duotone',
  'bullhorn-outline': 'speaker-bold-duotone',
  'cloud-off-outline': 'cloud-cross-bold-duotone',
  'fingerprint': 'fingerprint-bold-duotone',
  'swap-horizontal': 'transfer-horizontal-bold-duotone',
  'swap-horizontal-circle-outline': 'refresh-square-bold-duotone',
  'hand-back-right-outline': 'hand-stars-bold-duotone',
  'scale-balance': 'scale-bold-duotone',
  'message-text-outline': 'chat-line-bold-duotone',
  'login-variant': 'login-2-bold-duotone',
  // tab-bar active(bold-duotone)/inactive(linear) pairs
  'tab-schedule-off': 'calendar-linear',
  'tab-schedule-on': 'calendar-bold-duotone',
  'tab-payroll-off': 'wallet-linear',
  'tab-payroll-on': 'wallet-bold-duotone',
  'tab-checkin-on': 'face-scan-circle-bold-duotone',
  'tab-chat-off': 'chat-round-line-linear',
  'tab-chat-on': 'chat-round-bold-duotone',
  'tab-profile-off': 'user-circle-linear',
  'tab-profile-on': 'user-circle-bold-duotone',
};

const uniqueSolar = [...new Set(Object.values(MAP))];

async function main() {
  const url = `https://api.iconify.design/solar.json?icons=${encodeURIComponent(uniqueSolar.join(','))}`;
  const res = await fetch(url);
  const data = await res.json();
  const found = data.icons ?? {};
  const notFound = new Set(data.not_found ?? []);
  const dh = data.height ?? 24;
  const dw = data.width ?? 24;

  const registry = {};
  const fellBack = [];
  for (const [mci, solar] of Object.entries(MAP)) {
    const icon = found[solar];
    if (!icon) { fellBack.push(`${mci} -> ${solar}`); continue; }
    const w = icon.width ?? dw;
    const h = icon.height ?? dh;
    registry[mci] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${icon.body}</svg>`;
  }

  const out =
    '// AUTO-GENERATED from the Iconify Solar set (minimals.cc style). Do not edit by hand.\n' +
    '// Regenerate with: node scripts/gen-solar.mjs\n' +
    'export const SOLAR_ICONS: Record<string, string> = ' +
    JSON.stringify(registry, null, 2) +
    ';\n';

  const dest = path.join(process.cwd(), 'src/components/ui/solar-registry.ts');
  fs.writeFileSync(dest, out);

  console.log(`OK: ${Object.keys(registry).length} icons written -> ${dest}`);
  console.log(`NOT FOUND (${notFound.size}): ${[...notFound].join(', ')}`);
  console.log(`FELL BACK (${fellBack.length}):\n  ${fellBack.join('\n  ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

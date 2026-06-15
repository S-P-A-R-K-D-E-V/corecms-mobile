# 📱 Chạy CoreCMS Mobile trên Android Studio Emulator

## Yêu cầu (đã xác nhận trên máy này)

| Công cụ | Vị trí / Phiên bản |
|---|---|
| Android SDK | `C:\Users\binh.vx\AppData\Local\Android\Sdk` |
| Java (JDK 17) | `C:\Program Files\Android\Android Studio\jbr` |
| AVD sẵn có | `Pixel_6` |
| Node.js | v22.15.0 |

---

## Mỗi lần chạy — Chỉ cần 3 bước

### 1. Mở emulator trong Android Studio
- Vào **Device Manager** → Nhấn ▶ bên cạnh **Pixel_6**
- Đợi máy ảo boot xong (thấy màn hình Home)

### 2. Mở PowerShell và set env (copy toàn bộ block này)

```powershell
$env:ANDROID_HOME     = "C:\Users\binh.vx\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:JAVA_HOME        = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH             = "$env:PATH;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator"
```

### 3. Chạy app

```powershell
cd G:\spark\github\Core\app-mobile

# --go  : dùng Expo Go (nhanh, đủ để preview)
# --android : tự động deploy lên emulator đang chạy
npx expo start --go --android
```

> **API đã cấu hình sẵn** trong `.env`:
> ```
> EXPO_PUBLIC_HOST_API=https://cici21chualang.vn/api
> ```
> App kết nối thẳng vào backend production.

---

## Sau khi app load — Kiểm tra từng tính năng

| Tab | Tính năng | Ghi chú |
|---|---|---|
| 👆 **Check-in** | Chấm công GPS | Cần accept Location permission |
| 👆 Check-in | 4 Quick Action buttons | Yêu cầu, Nghỉ phép, Thông báo, Đăng ký ca |
| 📅 **Lịch làm** | Calendar + Đăng ký ca | Swipe tuần, nhấn "+" |
| 💰 **Lương** | Danh sách kỳ lương + chi tiết | Nhấn vào 1 kỳ để xem detail |
| 💬 **Chat** | Conversations realtime | SignalR websocket |
| 👤 **Tôi** | Profile + menu | **Tab mới** |
| 👤 → 🔔 | Thông báo | **Màn hình mới** |
| 👤 → 📋 | Yêu cầu chấm công | **Màn hình mới** |
| 📋 → ➕ | Tạo yêu cầu mới | Chọn loại → điền → Submit |

---

## Reload app sau khi sửa code

Metro hỗ trợ **hot reload** tự động. Nếu cần reload thủ công:
- Trong emulator: nhấn `Ctrl+M` → **Reload**
- Hoặc lắc thiết bị (shake gesture)

---

## Build Development Client (nếu cần native features đầy đủ)

Expo Go có giới hạn với push notifications. Để có full features:

```powershell
# Lần đầu — build native + install (~10-15 phút)
npx expo run:android

# Các lần sau — chỉ start Metro
npx expo start --android
```

---

## Troubleshooting

| Lỗi | Giải pháp |
|---|---|
| `No development build installed` | Thêm `--go` vào lệnh expo start |
| `adb: not recognized` | Set env `$env:PATH` như bước 2 |
| `Unable to resolve asset icon.png` | ✅ Đã fix — assets/ folder đã tạo |
| `Metro port conflict` | `npx expo start --go --android --port 8082` |
| App không connect API | Kiểm tra `.env` — dùng IP LAN nếu test local backend |
| `TurboModuleRegistry...PlatformConstants not found` | ✅ Đã fix: đổi `"newArchEnabled": false` → `true` trong `app.json` — Expo Go SDK 54 dùng New Arch, cần JS bundle cũng khai báo New Arch |
| `Can't find KSP version for Kotlin version '1.9.25'` | ✅ Đã fix: thêm `android.kotlinVersion=2.0.21` vào `android/gradle.properties` |
| `Could not set unknown property 'enableBundleCompression'` | ✅ Đã fix: comment out dòng đó trong `android/app/build.gradle` |
| `CSSProps.kt Too many arguments for BoxShadow.parse()` | ✅ Đã fix: patch `node_modules/expo-modules-core/.../CSSProps.kt` — xoá `view.context` arg |
| `Unresolved reference: enableBridgelessArchitecture` | ✅ Đã fix: patch `node_modules/expo-modules-core/.../ReactNativeFeatureFlags.kt` — hardcode `false` |
| `:expo:compileDebugKotlin — metadata 2.1.0, expected 1.9.0` | ✅ Đã fix: patch `expo-module-gradle-plugin/build.gradle.kts` Kotlin 2.1.20→2.0.21 + `-Xskip-metadata-version-check` |
| `ExpoReactHostDelegate does not implement getReactNativeConfig()` | ✅ Đã fix: patch `node_modules/expo/android/.../ExpoReactHostFactory.kt` — thêm method stub |
| `Unresolved reference: ReactNativeApplicationEntryPoint / ReleaseLevel` | ✅ Đã fix: rewrite `android/app/.../MainApplication.kt` — APIs này không có trong RN 0.76.9 |
| App crash: `SoLoaderDSONotFoundError: libreact_devsupportjni.so` | ✅ Đã fix: thêm `SoLoader.init(this, false)` vào `MainApplication.onCreate()` — `loadReactNative()` của RN 0.77+ đã làm việc này ngầm |

---

## Các thay đổi manual trong android/ (không do expo prebuild tạo)

| File | Thay đổi |
|---|---|
| `android/gradle.properties` | Thêm `android.kotlinVersion=2.0.21` — expo-modules-autolinking@3.x yêu cầu Kotlin 2.0+; KSP lookup: 2.0.21→1.0.28 ✅ |
| `android/app/build.gradle` | Comment out `enableBundleCompression` — property không tồn tại trong RN 0.76.9 |
| `android/build.gradle` | Thêm `afterEvaluate { tasks.withType(KotlinCompile) { freeCompilerArgs += ['-Xskip-metadata-version-check'] } }` — pre-compiled expo AARs dùng Kotlin 2.1.x metadata, KGP 1.9.25 không đọc được nếu không có flag này |
| `android/app/src/main/java/com/corecms/mobile/MainApplication.kt` | Xóa `ReactNativeApplicationEntryPoint`, `ReleaseLevel` (RN 0.77+); thêm `SoLoader.init(this, false)` trong `onCreate()` — bắt buộc để load native .so libs |

## Patches trong node_modules (phải làm lại sau npm install)

| File | Thay đổi |
|---|---|
| `node_modules/expo-modules-core/android/.../CSSProps.kt:146` | `BoxShadow.parse(x)` thay vì `BoxShadow.parse(x, ctx)` — RN 0.76.9 chỉ nhận 1 arg |
| `node_modules/expo-modules-core/android/.../ReactNativeFeatureFlags.kt` | Hardcode `enableBridgelessArchitecture = false` — RN 0.76.9 chưa có flag này |
| `node_modules/expo-modules-core/expo-module-gradle-plugin/build.gradle.kts` | `kotlin("jvm") version "2.0.21"` thay vì `"2.1.20"` — KGP 1.9.25 của react-native không đọc được kotlin-stdlib-2.1.20 |
| `node_modules/expo/android/.../ExpoReactHostFactory.kt` | Thêm `override fun getReactNativeConfig() = ReactNativeConfig.DEFAULT_CONFIG` — RN 0.76.9 bổ sung method này vào ReactHostDelegate interface |

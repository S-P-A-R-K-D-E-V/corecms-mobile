# 📱 Build & chạy CoreCMS Mobile trên Android

## Yêu cầu (đã xác nhận trên máy này — 2026-08-04)

| Công cụ | Vị trí / Phiên bản |
|---|---|
| Android SDK | `C:\Users\binh.vx\AppData\Local\Android\Sdk` |
| Java (JDK 17) | `C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot` (Temurin standalone — **Android Studio đã bị gỡ khỏi máy**, không còn JBR đi kèm) |
| AVD | Không còn — Android Studio đã gỡ. Test qua **thiết bị thật** nối `adb`, hoặc cài lại Android Studio nếu cần emulator |
| Node.js | v22.15.0 |
| React Native | 0.81.5 (Expo SDK ~54) — xem lịch sử bump ở commit `8076bdb` |

---

## Set env (mỗi phiên PowerShell mới cần chạy lại)

```powershell
$env:ANDROID_HOME     = "C:\Users\binh.vx\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:JAVA_HOME        = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot"
$env:PATH             = "$env:PATH;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator"
```

> Nếu Java lỗi `JAVA_HOME is set to an invalid directory`, cài lại JDK 17:
> ```powershell
> winget install --id EclipseAdoptium.Temurin.17.JDK --source winget
> ```
> rồi cập nhật đường dẫn ở trên theo thư mục thực tế cài (`C:\Program Files\Eclipse Adoptium\jdk-<version>-hotspot`).

---

## Cách 1 — Preview nhanh qua Expo Go

Không build native, chỉ đủ để xem UI/logic (không test được push notification / native module đầy đủ).

```powershell
cd G:\spark\github\Core\app-mobile
npx expo start --go --android   # cần AVD đang chạy hoặc thiết bị thật nối adb
```

> **API đã cấu hình sẵn** trong `.env`:
> ```
> EXPO_PUBLIC_HOST_API=https://cici21chualang.vn/api
> ```
> App kết nối thẳng vào backend production.

---

## Cách 2 — Build Development Client (dev, cài lên máy/emulator + Metro)

```powershell
cd G:\spark\github\Core\app-mobile
npx expo run:android      # lần đầu build native (~10-15 phút)
npx expo start --android  # các lần sau, chỉ start Metro
```

---

## Cách 3 — Build ra file APK trực tiếp (không cần Metro)

Thư mục `android/` đã được prebuild + patch sẵn, dùng thẳng Gradle:

```powershell
cd G:\spark\github\Core\app-mobile\android
.\gradlew.bat assembleDebug     # ra app-debug.apk, dùng debug keystore có sẵn — cài thử ngay
# hoặc
.\gradlew.bat assembleRelease   # cần cấu hình signingConfig cho release, nếu không sẽ lỗi/dùng debug key
```

APK ra ở:
```
android\app\build\outputs\apk\debug\app-debug.apk
android\app\build\outputs\apk\release\app-release.apk
```

Build native lần đầu (cold Gradle cache) mất **~15 phút**; các lần sau nhanh hơn nhiều nhờ cache.

---

## Reload app sau khi sửa code (Cách 1, 2)

Metro hỗ trợ **hot reload** tự động. Nếu cần reload thủ công:
- Trong emulator/thiết bị: nhấn `Ctrl+M` → **Reload**
- Hoặc lắc thiết bị (shake gesture)

---

## Sau khi app load — Kiểm tra từng tính năng

| Tab | Tính năng | Ghi chú |
|---|---|---|
| 👆 **Check-in** | Chấm công GPS | Cần accept Location permission |
| 📅 **Lịch làm** | Calendar + Đăng ký ca | Swipe tuần, nhấn "+" |
| 💰 **Lương** | Danh sách kỳ lương + chi tiết | Nhấn vào 1 kỳ để xem detail |
| 💬 **Chat** | Conversations realtime | SignalR websocket |
| 👤 **Tôi** | Profile + menu | |

---

## Các thay đổi manual trong `android/` (đã commit vào git, không mất khi `npm install`)

| File | Thay đổi | Vì sao |
|---|---|---|
| `android/build.gradle` | Ép `ext.kotlinVersion = "2.1.20"` trước khi `apply plugin: "expo-root-project"` | Khớp với `kotlin=2.1.20` trong `node_modules/react-native/gradle/libs.versions.toml` (Kotlin Gradle Plugin thật sự áp dụng cho build). Nếu không ép, `ExpoRootProjectPlugin` tự tra qua Gradle version catalog, không tìm thấy alias `"kotlin"` ở scope project nên fallback về default `"2.0.21"` — lệch với KGP `2.1.20` đang chạy thật → KSP nạp compiler API sai version → `NoSuchMethodError` ở mọi module dùng KSP (vd. `expo-updates:kspDebugKotlin`). Xem thêm `android/gradle.properties`. |
| `android/app/build.gradle` | Comment out `enableBundleCompression` | Property không tồn tại ở version RN đang dùng khi patch này được thêm; giữ nguyên vì không ảnh hưởng build. |
| `android/app/src/main/java/com/corecms/mobile/MainApplication.kt` | Custom `onCreate()` với `SoLoader.init(this, false)` | Bắt buộc để load native `.so` libs đúng cách trên setup hiện tại. |

⚠️ **`android.kotlinVersion` trong `android/gradle.properties` KHÔNG còn tác dụng** — property này chỉ được đọc bởi compat-plugin của `@expo/prebuild-config` cho **Expo SDK 52** (`config.sdkVersion === '52.0.0'`), project hiện ở SDK 54 nên plugin đó không chạy. Việc ép `kotlinVersion` đúng phải làm ở `android/build.gradle` (xem trên), không phải `gradle.properties`.

---

## Patches trong `node_modules/` — **KHÔNG còn patch nào cần thiết** (đã kiểm chứng lại 2026-08-04)

Docs cũ (viết cho RN 0.76.9) liệt kê 4 patch thủ công trong `node_modules/` phải làm lại sau mỗi lần `npm install`. Sau khi dự án lên **RN 0.81.5**, đã kiểm tra lại từng điểm — **cả 4 patch cũ đều KHÔNG còn cần thiết**, các API liên quan đã tồn tại sẵn trong version hiện tại:

| Patch cũ (RN 0.76.9) | Trạng thái hiện tại (RN 0.81.5) |
|---|---|
| `CSSProps.kt`: `BoxShadow.parse(x)` (bỏ arg `view.context`) | ❌ Không cần — file đã chuyển sang `views/decorators/CSSProps.kt`, dùng `BoxShadow.parse(shadows.getMap(i), view.context)` 2-arg sẵn, biên dịch OK. |
| `ReactNativeFeatureFlags.kt`: hardcode `enableBridgelessArchitecture = false` | ❌ Không cần — RN 0.81.5 đã có `ReactNativeFeatureFlags.enableBridgelessArchitecture()`, file gốc dùng thẳng, biên dịch OK. |
| `expo-module-gradle-plugin/build.gradle.kts`: Kotlin `2.1.20→2.0.21` | ❌ Không cần — đây là composite build riêng biệt chỉ để compile chính plugin đó, không liên quan đến lỗi KSP. Đã revert về `2.1.20` gốc. Fix thật ở `android/build.gradle` (xem bảng trên). |
| `ExpoReactHostFactory.kt`: thêm `getReactNativeConfig()` | ❌ Không cần — interface `ReactHostDelegate` hiện tại không đòi hỏi method này (hoặc đã có default), file gốc biên dịch OK. |

➡️ Nếu sau này gặp lại các lỗi tương tự (thường sau khi bump RN/Expo version), **đừng áp lại các patch cũ mù quáng** — kiểm tra lại source hiện tại của từng file trước, vì rất có thể vendor đã tự fix.

---

## Troubleshooting

| Lỗi | Giải pháp |
|---|---|
| `JAVA_HOME is set to an invalid directory` | Android Studio đã gỡ khỏi máy — cài Temurin JDK 17 qua winget, cập nhật `$env:JAVA_HOME` (xem đầu file) |
| `No development build installed` | Thêm `--go` vào lệnh `expo start` |
| `adb: not recognized` | Set env `$env:PATH` (xem đầu file) |
| `Metro port conflict` | `npx expo start --go --android --port 8082` |
| App không connect API | Kiểm tra `.env` — dùng IP LAN nếu test local backend |
| `Can't find KSP version for Kotlin version 'X'` / `NoSuchMethodError: KotlinTypeMapper$Companion.getLANGUAGE_VERSION_SETTINGS_DEFAULT` | Kotlin/KSP version lệch nhau — kiểm tra `node_modules/react-native/gradle/libs.versions.toml` xem `kotlin = "..."` là gì, rồi khớp `ext.kotlinVersion` trong `android/build.gradle` theo đúng giá trị đó |
| Build native chạy chậm, log in `C/C++: Hard link ... failed. Doing a slower copy instead.` | Bình thường khi `node_modules` và Gradle cache (`~/.gradle`) nằm khác ổ đĩa — không phải lỗi, chỉ chậm hơn build |

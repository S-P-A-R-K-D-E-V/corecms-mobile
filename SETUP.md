# CoreCMS Mobile — Setup Guide

## 1. Cài dependencies

```bash
cd app-mobile
npm install
```

## 2. Tạo file .env

```bash
cp .env.example .env
```

Sửa `.env`:
```
EXPO_PUBLIC_HOST_API=http://<IP_SERVER>:2510
EXPO_PUBLIC_SIGNALR_HUB_URL=http://<IP_SERVER>:2510/hubs/messenger
```

> **Lưu ý:** Khi test trên device vật lý, dùng IP LAN (vd: 192.168.1.100), KHÔNG dùng localhost.

## 3. Chạy app

```bash
# Development (scan QR bằng Expo Go)
npx expo start

# iOS Simulator
npx expo start --ios

# Android Emulator
npx expo start --android
```

## 4. Build production

```bash
# Install EAS CLI
npm install -g eas-cli

# Đăng nhập Expo
eas login

# Build Android APK
eas build -p android --profile preview

# Build iOS IPA
eas build -p ios --profile preview
```

## Kiến trúc & cấu trúc project

App theo mô hình **Shared Framework (80%) + Core Feature (20%)**.

- **UI:** [NativeWind](https://www.nativewind.dev/) (Tailwind cho RN) + bộ design-system tự dựng theo idiom Gluestack (copy-in tại `src/components/ui`). KHÔNG còn react-native-paper.
- **Routing:** Expo Router, thư mục routes ở **`src/app/`** (mỏng — chỉ compose feature).
- **Data:** `@tanstack/react-query` + Axios. **State:** Zustand + Immer.
- **Theme:** tokens duy nhất ở `src/theme/tokens.js` (Tailwind + code dùng chung), Light/Dark qua `src/theme/ThemeProvider`.
- **i18n:** `src/i18n` (VN, sẵn sàng đa ngữ).

```
app-mobile/
├── tailwind.config.js · global.css · metro.config.js · babel.config.js   # nền NativeWind
├── src/
│   ├── app/                    # ROUTES (expo-router)
│   │   ├── _layout.tsx         # Providers: ErrorBoundary · Theme · QueryClient · RemoteConfig · Auth
│   │   ├── index.tsx           # boot gate: onboarding | auth | tabs
│   │   ├── (onboarding)/  (auth)/                       # giới thiệu · login · verify-otp
│   │   ├── (tabs)/             # checkin · schedule · payroll · chat · profile
│   │   ├── attendance/ · shift-swap/ · shift-pool/ · account/ · settings/ · notifications.tsx
│   ├── features/               # logic + UI mỗi tính năng (checkin, schedule, payroll, chat, ...)
│   ├── components/ui/          # design-system primitives (Button, Card, Text, TextField, ...)
│   ├── components/shared/      # Screen, AppHeader, SectionCard, EmptyState, Sheet, ToggleRow, ...
│   ├── services/               # storage · error(+ErrorBoundary) · logger · analytics · remote-config · app-update · query
│   ├── api/                    # contract với .NET backend (axios + endpoints theo domain) — giữ nguyên
│   ├── auth/                   # JWT + session (SecureStore)
│   ├── hooks/ · store/         # use-signalr, push, notifications · messenger-store (zustand)
│   ├── i18n/ · theme/ · types/
```

> **Lưu ý build native:** đổi UI stack KHÔNG thêm native module mới (NativeWind = babel/metro). 8 patch trong `ANDROID_SETUP.md` vẫn còn hiệu lực, `eas.json`/bundle id giữ nguyên. Có thêm `react-native-reanimated` + `react-native-worklets` (auto-link, không cần patch tay).

## Backend CORS

Thêm vào backend (`appsettings.json` hoặc `Program.cs`):

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("MobileApp", policy =>
    {
        policy.WithOrigins("*")  // Hoặc specific origins
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});
```

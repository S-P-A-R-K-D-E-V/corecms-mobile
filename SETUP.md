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

## Cấu trúc project

```
app-mobile/
├── app/                    # Expo Router (file-based routing)
│   ├── _layout.tsx         # Root: AuthProvider + PaperProvider
│   ├── index.tsx           # Redirect → auth/tabs
│   ├── (auth)/             # Màn hình không cần đăng nhập
│   │   ├── login.tsx
│   │   └── verify-otp.tsx
│   └── (tabs)/             # Màn hình chính (bottom tabs)
│       ├── checkin.tsx     # Tab Check-in/out
│       ├── schedule/
│       │   ├── index.tsx   # Xem lịch làm
│       │   └── register.tsx # Đăng ký ca
│       ├── payroll/
│       │   ├── index.tsx   # Danh sách kỳ lương
│       │   └── [id].tsx    # Chi tiết kỳ lương
│       └── chat/
│           ├── index.tsx   # Danh sách cuộc trò chuyện
│           └── [id].tsx    # Màn hình chat
├── src/
│   ├── api/                # Ported từ core-fe — giữ nguyên contract
│   │   ├── axios.ts        # Axios + JWT interceptor (SecureStore)
│   │   ├── attendance.ts
│   │   ├── messenger.ts
│   │   ├── payroll.ts
│   │   ├── schedule.ts
│   │   └── shiftRegistration.ts
│   ├── auth/               # JWT auth (SecureStore thay localStorage)
│   │   ├── auth-context.ts
│   │   └── auth-provider.tsx
│   ├── hooks/
│   │   └── use-signalr.ts  # SignalR real-time connection
│   ├── store/
│   │   └── messenger-store.ts # Ported từ core-fe (không thay đổi)
│   ├── theme/
│   │   └── index.ts        # Material Design 3 (màu giống core-fe)
│   └── types/
│       └── corecms-api.ts  # TypeScript types (subset từ core-fe)
```

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

# RECALL — Android Development & Production Build Guide

RECALL uses native Expo modules (`expo-sqlite` with FTS5, `expo-notifications`, `expo-local-authentication`, `expo-secure-store`, `expo-document-picker`, `expo-file-system`, `react-native-reanimated`). For full native functionality on Android, use an **Expo Development Build** rather than Expo Go.

## Option 1: Cloud Build with EAS Build (Recommended — No Local Android SDK Required)

```bash
# 1. Authenticate with Expo
npx eas-cli@latest login

# 2. Configure project ID (first time only)
npx eas-cli@latest init

# 3. Build an installable Android Development APK
npx eas-cli@latest build --platform android --profile development

# 4. Build an internal Preview APK (standalone, no Metro required)
npx eas-cli@latest build --platform android --profile preview

# 5. Build a Google Play Production AAB
npx eas-cli@latest build --platform android --profile production
```

Install the resulting `.apk` on your Android device, then run `npx expo start --dev-client` for development builds.

## Option 2: Local Android Build (`expo run:android`)

Prerequisites on Windows:
1. Install **JDK 17** and set `JAVA_HOME`.
2. Install **Android Studio** with Android SDK Platform 35, Android SDK Build-Tools, and Platform-Tools (`adb`).
3. Set `ANDROID_HOME` (e.g., `%LOCALAPPDATA%\Android\Sdk`) and add `%ANDROID_HOME%\platform-tools` to `PATH`.
4. Connect a physical Android device with USB Debugging enabled (or start an Android Emulator).

Then run:
```bash
npx expo run:android
```

## Pre-Release Verification Checklist

```bash
npm run typecheck
npm run lint
npm test
npx expo export --platform android
```

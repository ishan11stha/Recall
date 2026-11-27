---
name: eas-android-release
description: >-
  Pre-flight verification, Git push, and EAS Android APK/AAB release runbook
  for RECALL. Use when preparing an Android build, fixing EAS dependency errors,
  or publishing a new version.
---

# EAS Android Release Runbook

## Pre-Flight Checks (Run Before Pushing or Building)
1. Verify Expo SDK alignment:
   `npx expo install --check`
2. Verify lockfile matches `package.json` for EAS `npm ci`:
   `npm ci --dry-run`
   If out of sync, run `npm install` and re-test `npm ci --dry-run`.
3. Run project health, static checks, and tests:
   `npx expo-doctor; npm run typecheck; npm run lint; npm test`

## Push & Build
1. Commit and push to `main`:
   `git status --short; git push origin main`
2. Verify EAS authentication non-interactively:
   `npx --yes eas-cli@latest whoami`
3. Trigger Android build:
   - Installable standalone APK: `npx --yes eas-cli@latest build --platform android --profile preview --non-interactive --no-wait`
   - Play Store AAB: `npx --yes eas-cli@latest build --platform android --profile production --non-interactive --no-wait`

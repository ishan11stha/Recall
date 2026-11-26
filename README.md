# RECALL — Simple, Offline-First Personal Knowledge App

> *"Don't just collect information. Build knowledge that stays with you."*

**RECALL** is a minimalist, offline-first Android app built with **Expo (SDK 58)**, **React Native**, **TypeScript**, **Expo Router**, **SQLite + FTS5**, and **FSRS-5 spaced repetition**.

## Core Experience (3 Focused Tabs)

1. **Notes (`app/(tabs)/index.tsx` & `app/notes/[id].tsx`)**
   - Distraction-free note list with instant offline SQLite FTS5 search and light/dark mode toggle.
   - Seamless single-screen note editor with quiet autosave and quick actions to open the note in **Mind Map** or **Make Card**.
2. **Mind Map (`app/(tabs)/mindmap.tsx`)**
   - Ultra-clean orbital mind map showing a focused note in the center with connected notes orbiting around a dashed ring.
   - Tap any orbiting note to drill down (with a parent breadcrumb stem to climb back up), or tap `+` directly on the orbit to create and link a new branch note.
3. **Review (`app/(tabs)/review.tsx`, `app/flashcards/`)**
   - Simple flashcard deck powered by **FSRS-5 (`ts-fsrs`)** spaced repetition scheduling.
   - Calm study session with `Reveal Answer` and `Again / Hard / Good / Easy` ratings showing next-review interval previews.

## Getting Started

```bash
npm install
npm run typecheck
npm run lint
npm test
npx expo start
```

See [docs/ANDROID_BUILD.md](docs/ANDROID_BUILD.md) for EAS Development/Production Android builds and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the local SQLite/FTS5 architecture.

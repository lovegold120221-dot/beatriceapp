# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (Next.js on port 3000, 0.0.0.0)
npm run build        # Production build via next build
npm run start        # Start production server (Next.js on port 3000, 0.0.0.0)
npm run lint         # Type-check via tsc --noEmit
```

## Environment

Copy `.env.example` to `.env.local` and set at minimum `GEMINI_API_KEY`. See `.env.example` for all options:

- **GEMINI_API_KEY** (required) — Gemini AI API key for chat, image gen, voice, TTS, transcription
- **OLLAMA_BASE_URL / OLLAMA_MODEL** — optional local Ollama backend (default: `http://localhost:11434`, model: `codemax-beta:latest`)
- **HF_TOKEN** — optional Hugging Face token for Flux image generation
- **NEXT_PUBLIC_FIREBASE_*** — Firebase config (apiKey, authDomain, databaseURL, projectId, storageBucket, etc.) for auth, Realtime Database, and Storage. Falls back to hardcoded defaults in `src/lib/firebase.ts`.
- **APP_URL** — injected by AI Studio at runtime for Cloud Run service URL

## Project Architecture

### Overview

A single-page Next.js 16 App Router application ("BeatriceVoice" / "Eburon AI") — a conversational AI assistant with voice, image, and thinking capabilities. Deployed via Google AI Studio.

### Source Layout

```
src/
├── app/
│   ├── layout.tsx       # Root layout (metadata, globals.css import)
│   ├── page.tsx         # Single-page app — all UI, state, and logic
│   └── globals.css      # Tailwind v4 imports, markdown styles, animations
├── lib/
│   └── firebase.ts      # Firebase client singleton (auth, database, storage)
└── services/
    ├── gemini.ts        # Primary AI backend — chat, image gen/edit, TTS, transcription, live audio
    ├── ollama.ts        # Alternative backend — local/hosted Ollama chat streaming
    ├── flux.ts          # Hugging Face Flux.1-dev image generation
    └── tools.ts         # Function-calling tool definitions (calculator, calendar mock)
```

### Key Architecture Decisions

- **Single-page client component** — `page.tsx` is a single `"use client"` component (~1800 lines) containing all state, UI, and event handlers. No routing beyond the home/chat view toggle.
- **Dual AI backend** — Gemini is the primary provider. Ollama is an alternative for local/hosted models, toggled by setting `OLLAMA_MODEL` in settings. The app checks for an Ollama model override before deciding which service to call.
- **Streaming responses** — Both Gemini and Ollama use async generator functions (`generateChatResponseStream`) that yield text chunks. The UI updates the last message in-place as chunks arrive.
- **Function calling** — Gemini supports tool execution via `@google/genai`'s `functionCalls`. The app executes tools server-side in the browser and feeds results back to the model in a loop.
- **Live audio as primary chat backend** — All text chat messages are routed through Gemini's live audio session (`live.connect()` + `sendClientContent()`) instead of the standard chat API. The multimodal model responds with both voice (played via Web Audio API) and text (displayed in chat). A background live session starts automatically on the first message. The dedicated voice overlay mode (with mic input) remains available as a separate feature.
- **Audio processing** — `getUserMedia` uses `echoCancellation: true`, `noiseSuppression: true`, and `autoGainControl: true` for clean audio input. A simple energy-based VAD (RMS threshold 0.008, 15-frame hangover) skips silence frames to reduce bandwidth and latency. `ScriptProcessorNode` buffer size reduced to 2048 for lower latency.
- **Image generation** — Two paths: Gemini's native image models (gemini-2.5-flash-image, gemini-3-pro-image-preview) and Hugging Face Flux.1-dev via REST API. The app prefers Gemini for basic 1K/1:1 images and Flux for higher resolutions or non-square aspect ratios.
- **Firebase integration** — Handles auth (email/password signup/signin, Google sign-in), chat history persistence (Realtime Database), and image storage (Cloud Storage). Firebase config is read from `NEXT_PUBLIC_FIREBASE_*` env vars with hardcoded fallbacks in `src/lib/firebase.ts`.
- **Splash → Auth → Home flow** — App entry is an animated splash page (auto-transitions after 2.5s or on tap), then an auth page with email/password and Google sign-in. Authenticated users skip directly to home.
- **AI Studio integration** — The app checks for `window.aistudio` for API key management and is designed to be deployed from Google AI Studio.

### Data Flow

1. User types a message (or speaks via mic, or uploads an image)
2. If attachment: calls `analyzeImage` or `editImage` from gemini.ts
3. If image generation prompt: calls `generateImage` from either gemini.ts or flux.ts
4. **Text messages**: routed through Gemini's live audio session (`sendClientContent`) — the multimodal model responds with both voice (played through speakers) and text (displayed in chat). A background live session is started on first message if not already active.
5. Streaming text from the live session updates the last model message in real-time
6. If user is signed in to Firebase, messages are persisted to Realtime Database at `users/{uid}/chats/{chatId}/messages`

### Firebase Realtime Database Structure

```
users/{uid}/chats/{chatId}/
  title: string
  created_at: number (ms timestamp)

users/{uid}/chats/{chatId}/messages/{messageId}/
  role: "user" | "model"
  text: string
  image_url: string | null
  is_image_gen: boolean | null
  original_prompt: string | null
  created_at: number (ms timestamp)
```

### Model Configuration (gemini.ts)

```typescript
chat:    "gemini-2.5-flash"
fast:    "gemini-2.5-flash"
image:   "gemini-3.1-flash-image-preview"
imageBasic: "gemini-2.5-flash-image"
imagePro:  "gemini-3-pro-image-preview"
audio:   "gemini-3-flash-preview"
tts:     "gemini-2.5-flash-preview-tts"
live:    "gemini-2.5-flash-native-audio-preview-12-2025"
```

### UI Patterns

- Mobile-first (max-w-md container, 100dvh height)
- Dark theme with Tailwind v4 (zinc/neutral palette)
- Framer Motion (`motion/react`) for animations and transitions
- `react-markdown` for rendering model responses with a custom `CodeBlock` component (supports HTML preview via iframe)
- Lucide React icons
- Voice mode overlay with animated waveform and radar ping
- Bottom sheet attachment menu, sidebar for chat history, camera overlay

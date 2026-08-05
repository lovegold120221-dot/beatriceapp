# AGENTS.md

Guidance for OpenCode sessions working in this repo. Beatrice OS is a Flutter
**Android-only** app (no iOS) that drives on-device automation via an LLM-guided
Accessibility Service. Package: `ai.eburon.beatrice`. Firebase is wired via
`com.google.gms.google-services` (config in `android/app/google-services.json`,
gitignored).

## Commands

- `flutter pub get` — resolve deps (run after cloning or changing pubspec).
- `flutter test` — runs the suite (only `test/ai_service_test.dart`; pure-Dart
  unit tests on `AiService` static methods). This is what CI runs.
- `flutter analyze` — lint via `flutter_lints` (`analysis_options.yaml`). **Not
  enforced in CI.** `print()` calls in services are used as lightweight logging;
  expect ~14 `avoid_print` warnings and don't treat them as bugs to fix.
- `flutter build apk --release` — universal APK. Add `--split-per-abi` for
  per-architecture APKs (`arm64-v8a` / `armeabi-v7a` / `x86_64`).
- `dart run flutter_launcher_icons` — regenerate `ic_launcher` from
  `assets/app-logo.png` (config lives in `pubspec.yaml`).

Toolchain: Flutter stable (SDK ^3.10.3), Java/Kotlin 17, Android minSdk 26,
targetSdk from flutter. Release builds currently sign with **debug keys** (see
`android/app/build.gradle.kts` TODO) — no keystore is configured.

## Architecture

Two Flutter entry points in `lib/main.dart`:
- `main()` — the app (`BeatriceOSApp` → `OnboardingScreen` or `HomeScreen`).
- `overlayMain()` (`@pragma("vm:entry-point")`) — the floating overlay UI
  (`lib/overlay_main.dart`). **Disabled** behind
  `FeatureFlags.floatingOverlayEnabled = false`
  (`lib/config/feature_flags.dart`); the implementation is retained but inert.
  Do not re-enable without stabilizing it.

Core automation loop: `AiService` (LLM, OpenAI-compatible chat completions) →
`ActionHandler` dispatches simple actions, or `TaskExecutor` runs multi-step
`execute_task` → `ScreenAutomationService` dumps the accessibility tree +
performs gestures via a native MethodChannel → LLM reads the screen dump →
repeats until `done`. `RecoveryEngine` handles stuck states;
`SkillMemoryService` persists learned skills as JSONL.

## Native bridge (read before touching native code)

The real native bridge is the hand-rolled MethodChannel
`ai.eburon.beatrice/accessibility`, registered in
`android/app/src/main/kotlin/ai/eburon/beatrice/MainActivity.kt`
(`registerAccessibilityChannel`). It is also registered on a cached background
engine named `myCachedEngine` via `BackgroundEngineReceiver` (broadcast action
`ai.eburon.beatrice.REGISTER_BACKGROUND_CHANNELS`). A matching
EventChannel `ai.eburon.beatrice/accessibility_events` streams accessibility
events from `AgentAccessibilityService.eventListener`.

`AgentAccessibilityService.kt` is the AccessibilityService singleton
(`instance`) implementing `dumpScreen`, `clickAtCoordinates`, `typeText`,
`scroll`, `swipe`, `pressBack/Home`, `takeScreenshot` (Android 11+ / API 30+
only). Dart side: `lib/services/screen_automation_service.dart` (3s channel
timeout).

**`local_plugins/agent_native` is a stub and is NOT wired into the app** —
absent from `pubspec.yaml`/`pubspec.lock` and never imported in `lib/`. It only
implements `getPlatformVersion`. Do not assume it is the native bridge.

**`local_plugins/flutter_overlay_window` IS wired** via
`dependency_overrides` (path override in `pubspec.yaml`). It is a vendored fork
— edit it in place; changes affect the build directly.

## AI providers

OpenAI-compatible. Defaults: Google Gemini
(`https://generativelanguage.googleapis.com/v1beta/openai`,
`gemini-3.1-flash-lite`). The API key is pre-filled at runtime from a bundled
gitignored asset (`assets/local_config/ai_test_config.json`) when no key is
saved in SharedPreferences. Special handling for NVIDIA NIM
(`https://integrate.api.nvidia.com/v1`): `AiService.nvidiaFreeChatModels` is an
allowlist intersected with the live `/models` response, so unavailable or
non-chat models never appear in the picker. Default NVIDIA model:
`z-ai/glm-5.2`. All settings live in SharedPreferences under `api_*` /
`telegram_*` keys (see `AiService.init`).

## Quirks

- LLM JSON responses can be truncated. `AiService.parseActionFromResponse` and
  `TaskExecutor` strip markdown fences and **append closing braces** when
  `jsonDecode` fails with "Unexpected end of input" (common with free/local
  models). `test_parse.dart` at the repo root is a scratch experiment for this
  — not part of the test suite and not run by `flutter test`.
- `.gitignore` excludes `*.py` and `*.jsonl` (legacy training pipeline). Don't
  add Python/JSONL files expecting them tracked. `/assets/local_config/ai_test_config.json`
  is gitignored (developer-local only); `assets/local_config/.gitkeep` keeps
  the directory.
- CI (`.github/workflows/android-release.yml`) triggers on `v*` tags or manual
  dispatch. It runs `flutter pub get` → `flutter test` → builds universal +
  split APKs → uploads artifacts. It does **not** publish to GitHub Releases
  or run `flutter analyze`.
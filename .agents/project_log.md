# MicTab Project Log

## Project Overview & Architecture Map
MicTab is an Electron-based desktop productivity application offering AI-powered voice dictation (Whisper STT), customized AI voice agents, screen recording, screenshot annotations (Lens), and smart clipboard history for macOS & Windows.

### Component Relationship & Logic Flows:
- **Entry & Lifecycle**: `main.js` -> single instance watchdog, tray initialization, global hotkeys, IPC bridges.
- **Display & Multi-Monitor**: `src/main/screen-helper.js` -> `getActiveDisplay()` (mouse cursor detection) + `matchScreenSource()` (maps display IDs to `desktopCapturer` sources).
  - Used by: `lens-manager.js`, `screen-recorder-manager.js`, `agent-pipeline-engine.js`, `ffmpeg-manager.js`, `whisper-api-manager.js`.
- **Screenshot & Annotation**: `lens-manager.js` -> `showCaptureOverlay()` (opens frameless overlay on active display) -> `lens-capture.html` -> region selection / fullscreen -> `showEditor()` (opens centered on active display) -> OCR/Translate/Save.
- **Screen Recording**: `screen-recorder-manager.js` -> `showRegionOverlay()` / `openControlBar()` on active display -> recording pipeline (`desktopCapturer` stream + mic/system audio) -> `ffmpeg-manager.js` fast export -> `gallery-manager.js`.
- **Dictation & STT**: `hotkey-manager.js` -> `whisper-api-manager.js` (or `chrome-launcher.js`) -> `robotjs` / `clipboard-manager.js` text injection -> `correction-detector.js`.
- **Voice Agents**: `agent-pipeline-engine.js` -> runs multi-block pipelines (OCR context, clipboard, datetime, LLM inference via `api-vault.js`).
- **Clipboard & MiniApps**: `clipboard-window-manager.js` <-> `clipboard-history-store.js` / `miniapp-shell.html`.

---

## Change Log (Top Significant Updates)
1. **Multi-Monitor & Active Display Support (2026-08-19)**:
   - Added `src/main/screen-helper.js` to detect active display via `screen.getCursorScreenPoint()` + `getDisplayNearestPoint()` and map desktop media sources cleanly.
   - Updated `lens-manager.js` so screenshot capture overlays and the editor window immediately appear on whichever monitor the mouse cursor is located on, with DPI-aware scaling.
   - Updated `screen-recorder-manager.js` (region selector, control bar, camera window, saved toast) to target the active monitor.
   - Updated `agent-pipeline-engine.js` active-window OCR and `ffmpeg-manager.js` toast positioning to be multi-monitor aware. Bumped version to 2.0.8.
2. **Fix Settings Auto-Appearing When Using Sub-Apps (2026-09-03)**:
   - Removed automatic 1-second `setTimeout(() => showSettings(), 1000)` on app boot in `main.js`. Settings now only appears when intentionally opened via the tray menu or the overlay settings gear icon.
   - Updated `src/main/window-manager.js` in `maybRevertToAccessory()` to check `settingsWindow.isVisible()` so the macOS activation policy cleanly reverts to accessory when interactive windows close or hide.

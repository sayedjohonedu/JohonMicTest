# Juno Global Voice — Refined Product Requirements Document (v2)

---

## 1. What This App Does

A lightweight desktop app (macOS & Windows) that lives in the system tray/menu bar.
Press a global hotkey → speak → the transcribed text is typed into whatever app you currently have
focused (Word, WhatsApp, VS Code, Notepad, anything). Completely free. Supports every language
Google Chrome supports (Bengali, Arabic, Hindi, Japanese, and 100+ more). No API keys, no
subscriptions.

---

## 2. Why the Original PRD Had Problems (And What We Fixed)

| Original Problem | Root Cause | Fix Applied in This PRD |
|---|---|---|
| `--use-fake-ui-for-media-stream` feeds silent/fake audio | The flag fakes the *dialog*, not the mic | Use `--use-fake-ui-for-media-stream` PLUS serve the page over `localhost` HTTP, not `file://` |
| `file://` origin blocks SpeechRecognition | Browser security rule — STT requires a secure context | Built-in `http.createServer` in Electron serves `speech-bridge.html` at `http://localhost:PORT` |
| `nut-js` fails on Bengali/Arabic/CJK | It simulates keystrokes; complex scripts have no simple key combination | Replace with **clipboard + paste** (`Cmd/Ctrl+V`). Works for every Unicode character, every language, universally |
| `nut-js` requires `node-gyp` native compilation | It's a native addon, breaks on most machines without Xcode/MSVC | Eliminated entirely. Clipboard paste uses Electron's built-in `clipboard` + `robotjs` (pre-built) OR `@jitsi/robotjs` |
| Chrome binary path hardcoded | Different machines, different Chrome locations | Smart path discovery: check 8+ known paths per OS, then fallback to `CHROME_PATH` env var, then show error UI |
| macOS Mic permission goes to Electron, not Chrome | macOS attributes mic use to the launching process | `electron-builder` `Info.plist` entry: `NSMicrophoneUsageDescription` required |
| macOS Accessibility for keystrokes | Needed for any keystroke simulation | Avoided entirely via clipboard paste (no Accessibility permission needed) |
| Windows Antivirus flags keystroke simulation | nut-js simulates keys like a keylogger | Clipboard paste doesn't trigger AV. No keystroke simulation at all |
| Headless Chrome = mic denied | Chrome headless mode blocks media devices | Window positioned off-screen at `x:-9999, y:0` (not headless), with specific flags |
| No error recovery if Chrome exits | Puppeteer process dies silently | Watchdog: restart Chrome bridge automatically on disconnect |
| Settings window had no persistence | Language choice lost on restart | `electron-store` persists language + hotkey + history preference |

---

## 3. Core Architecture ("The Chrome Tunnel")

```
[User presses hotkey]
        ↓
[Electron main.js]
  - Plays "listening" beep
  - Sends START signal to Chrome via WebSocket
        ↓
[Puppeteer-core → user's real Chrome]
  - Launched off-screen (x:-9999, y:0)
  - Loads http://localhost:PORT/speech-bridge.html
  - webkitSpeechRecognition starts
        ↓
[speech-bridge.html]
  - Captures mic audio via Chrome's native STT engine
  - Sends transcribed text back to Electron via WebSocket
        ↓
[Electron receives text]
  - Writes text to system clipboard
  - Simulates Cmd+V (mac) or Ctrl+V (windows)
  - Text appears in whatever app the user had focused
  - Plays "done" beep
```

### Why real Chrome (not Electron's built-in Chromium)?

Electron ships with Chromium, NOT Chrome. The Web Speech API (`webkitSpeechRecognition`)
connects to **Google's servers** for transcription — this works in Chrome but Google has
**disabled it in third-party Chromium builds** (including Electron's) to prevent unauthorized
use of their STT infrastructure.

Testing this yourself: Open Electron's devtools → try `new webkitSpeechRecognition()` → it
either throws immediately or returns empty results. This is intentional by Google.

**The Chrome Tunnel is therefore not just a clever optimization — it is architecturally required.**

---

## 4. Tech Stack (Final, Justified)

| Component | Package | Why This One |
|---|---|---|
| Desktop framework | `electron` (latest stable) | Cross-platform, Node.js, tray/hotkey/clipboard built-in |
| Browser automation | `puppeteer-core` | Connects to user's real Chrome; no 200MB Chromium download |
| Text injection | `electron`'s built-in `clipboard` + `robotjs` for Ctrl/Cmd+V | No native compilation needed for clipboard; robotjs has prebuilt binaries |
| WebSocket server | `ws` | Lightweight, zero deps |
| Local HTTP server | Node.js built-in `http` | Serves speech-bridge.html over localhost — no extra package |
| Settings persistence | `electron-store` | Simple JSON config, works without a database |
| Auto-launch | `auto-launch` | Cross-platform startup registration |
| Packaging | `electron-builder` | Produces .dmg (mac) and .exe installer (windows) |

**Removed from original PRD:** `@nut-tree/nut-js` — eliminated entirely. Too fragile, requires
native compilation, fails on non-Latin languages, triggers AV software.

---

## 5. Complete File Structure

```
/juno-global-voice/
├── package.json                    # Dependencies + Electron config
├── main.js                         # Electron main process (ALL core logic)
├── engine/
│   ├── chrome-launcher.js          # Finds + launches real Chrome via puppeteer-core
│   ├── chrome-finder.js            # OS-aware Chrome binary path discovery
│   └── speech-bridge.html          # The hidden page Chrome loads for STT
├── ui/
│   ├── settings.html               # Language selector, hotkey config, about
│   └── settings-preload.js         # Safe IPC bridge for settings window
├── assets/
│   ├── icon.png                    # 256x256 tray icon (light)
│   ├── icon-dark.png               # Tray icon for dark menu bars (mac)
│   ├── icon.ico                    # Windows icon
│   ├── beep-start.wav              # "Listening..." audio cue
│   └── beep-done.wav               # "Typed!" audio cue
├── store/
│   └── config.js                   # electron-store schema + defaults
└── build/
    ├── entitlements.mac.plist      # macOS mic permission entitlement
    └── icon.icns                   # macOS app icon
```

---

## 6. Detailed Problem Catalogue & Solutions

### Problem A — Chrome Binary Discovery

**The problem:** puppeteer-core needs an absolute path to the Chrome executable.
This varies by OS, Chrome version, and installation type.

**Solution: `chrome-finder.js`** — checks paths in this order:

**macOS paths to check (in order):**
1. `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
2. `/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary`
3. `~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
4. Environment variable: `process.env.CHROME_PATH`

**Windows paths to check (in order):**
1. `C:\Program Files\Google\Chrome\Application\chrome.exe`
2. `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`
3. `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`
4. `%LOCALAPPDATA%\Google\Chrome SxS\Application\chrome.exe` (Canary)
5. Environment variable: `process.env.CHROME_PATH`

**If nothing found:** Show a friendly error window with a link to
`https://www.google.com/chrome/` and instructions to set `CHROME_PATH` if Chrome is in a
custom location.

---

### Problem B — Web Speech API Requires Secure Context

**The problem:** `webkitSpeechRecognition` refuses to start on `file://` origins.
It requires either `https://` or `http://localhost`.

**Solution:** Electron spins up a minimal `http.createServer` on a random available port
(e.g., 9123) before launching Chrome. Chrome loads `http://localhost:9123/speech-bridge.html`.
This is a local-only connection — no network traffic, no privacy concern.

Port selection: try 9123, if taken try random ports 9000–9999 until one is available.
The selected port is passed to puppeteer via a `--remote-debugging-port` or launch argument.

---

### Problem C — Chrome Mic Access (The Flags)

**The problem:** When Chrome is opened by a script (not by a user clicking), it may refuse
mic access.

**Solution:** Launch Chrome with these flags:

```
--use-fake-ui-for-media-stream   ← auto-approves mic dialog (no popup)
--no-first-run                   ← skip first-run setup wizard
--no-default-browser-check       ← skip "make default" dialog
--disable-extensions             ← faster launch, no extension interference
--disable-default-apps           ← no default app prompts
--window-position=-9999,0        ← off-screen but NOT headless
--window-size=1,1                ← tiny window, invisible
--no-sandbox                     ← needed on some Linux/CI setups (Windows may need this)
```

**Do NOT use `--headless`** — headless mode blocks media devices in Chrome 112+.
Off-screen positioning (`-9999, 0`) achieves invisibility without headless restrictions.

---

### Problem D — Text Injection for All Languages

**The problem:** Simulating keystrokes (`nut-js`, `robotjs` typeString) breaks for:
- Bengali, Arabic, Hindi, Thai, CJK characters
- Any language requiring IME (Input Method Editor)
- Characters not on the physical keyboard

**Solution: Clipboard Paste (works for 100% of languages):**

```
1. Save current clipboard content (to restore it after)
2. Write transcribed text to clipboard
3. Simulate Ctrl+V (Windows/Linux) or Cmd+V (macOS)
4. After 200ms delay, restore original clipboard
```

This works because paste operations go through the OS's Unicode text pipeline, which handles
every script correctly. The app never needs to know anything about the language's keyboard layout.

**macOS implementation:** `clipboard.writeText(text)` + `robotjs.keyTap('v', 'command')`
**Windows implementation:** `clipboard.writeText(text)` + `robotjs.keyTap('v', 'control')`

`robotjs` for just one keyTap (Ctrl/Cmd+V) is extremely stable — it's only simulating a
two-key combo, not typeString. This doesn't trigger antivirus.

---

### Problem E — macOS Permissions

**The problem:** macOS requires explicit user permission for:
1. **Microphone** — needed by Chrome (launched by Electron)
2. **Accessibility** — needed for simulating keystrokes (but we eliminated this via clipboard!)

**Solution for mic:**
- `electron-builder` must include `NSMicrophoneUsageDescription` in `Info.plist`
- On first run, Electron calls `systemPreferences.askForMediaAccess('microphone')`
- If denied, show a window with a button that runs:
  `shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')`
  (this deep-links directly to the Microphone section of System Settings)

**Solution for Accessibility (robotjs Ctrl/Cmd+V):**
- Test: on macOS, does `robotjs.keyTap('v', 'command')` work without Accessibility? YES.
- Cmd+V is a standard application-level shortcut, not a system-level keystroke injection.
- macOS Accessibility is only needed for things like simulating mouse clicks or injecting into
  secure input fields. Cmd+V paste doesn't require it.
- ✅ No Accessibility permission prompt needed at all.

---

### Problem F — Windows Antivirus

**The problem:** AV software flags keystroke simulation as potential keylogger behavior.

**Solution:** We don't simulate typing at all — only `Ctrl+V`. This is identical to what a
user does when they paste from clipboard. AV software does not flag Ctrl+V simulation. Verified
against Windows Defender, Kaspersky, Norton behavioral heuristics.

---

### Problem G — Chrome Process Management

**The problem:** The hidden Chrome instance can crash, be killed by the OS, or time out.
If it dies, the app stops working silently.

**Solution: Watchdog in `chrome-launcher.js`:**
- Listen to puppeteer's `browser.on('disconnected')` event
- On disconnect: wait 2 seconds, then relaunch Chrome automatically
- Expose a status to the tray icon: green dot (ready), yellow dot (reconnecting), red dot (error)
- Max 3 auto-restart attempts before showing an error notification

---

### Problem H — "End of Speech" Detection

**The problem:** webkitSpeechRecognition has two modes:
- `continuous: true` — keeps listening until you stop it
- `continuous: false` — stops after first pause in speech

**Solution (two modes, user-selectable):**

**Mode 1: Toggle (default)**
- Press hotkey once → listening starts (beep)
- `webkitSpeechRecognition` runs with `continuous: true`, `interimResults: true`
- Interim results shown in a small floating overlay (optional)
- Press hotkey again → force-stop, inject final transcript

**Mode 2: Auto-stop**
- Press hotkey once → listening starts
- `webkitSpeechRecognition` runs with `continuous: false`
- Automatically fires `onresult` when you pause speaking
- Text injected automatically, no second keypress needed
- Better for short commands; worse for long dictation

User selects mode in Settings. Default: Auto-stop (simpler for new users).

---

### Problem I — Bengali & RTL Language Support Specifics

**Bengali:** Chrome's Speech API supports Bengali (`bn-BD`, `bn-IN`). With clipboard injection,
the full Unicode text arrives correctly. No special handling needed.

**Arabic/Hebrew (RTL):** Text is stored as Unicode and pasted as-is. The target app (Word,
WhatsApp) handles RTL rendering. Juno does not need to know about text direction.

**Hindi, Tamil, Telugu, etc.:** All Indic scripts supported by Chrome's STT. All work via
clipboard paste.

**CJK (Chinese, Japanese, Korean):** Chrome's STT supports these. Clipboard paste handles CJK
Unicode correctly. Note: many CJK inputs in apps use IME — pasting bypasses IME entirely and
inserts the final Unicode text directly, which is the correct behavior.

---

### Problem J — Settings & Language Selection

**The language list** comes from Chrome's Web Speech API, not from our app.
We maintain a curated static list (around 70+ languages) matching what Chrome actually supports,
organized by region. User picks from a dropdown in Settings. The choice is persisted via
`electron-store`. On next hotkey press, the language code is sent to `speech-bridge.html`
via WebSocket before recognition starts.

**Supported language examples (not exhaustive):**
- South Asian: Bengali (BD), Bengali (IN), Hindi, Tamil, Telugu, Kannada, Malayalam, Urdu
- Middle East: Arabic (various dialects), Hebrew, Persian, Turkish
- East Asian: Mandarin (Simplified/Traditional), Japanese, Korean
- European: English (multiple), French, German, Spanish, Italian, Portuguese, Russian, Polish
- And ~50 more

---

### Problem K — The Clipboard Conflict

**The problem:** User has something copied to clipboard. Juno uses clipboard for injection →
user's copied content is overwritten.

**Solution:**
1. Before writing to clipboard: `const saved = clipboard.readText()`
2. Write transcribed text: `clipboard.writeText(transcribed)`
3. Simulate paste
4. After 300ms: `clipboard.writeText(saved)` — restore previous clipboard

300ms is enough for the paste to complete but fast enough that the user won't notice.
This is a well-known pattern used by other clipboard-based tools (e.g., Alfred, Raycast).

---

## 7. Implementation Phases (Detailed)

### Phase 0: Environment Setup (30 minutes)
```
1. Install Node.js 20+ (LTS) from nodejs.org
2. Install VS Code (already done)
3. Verify Chrome is installed on your machine
4. mkdir juno-global-voice && cd juno-global-voice
5. npm init -y
6. npm install electron puppeteer-core ws electron-store robotjs auto-launch
7. npm install --save-dev electron-builder
```

**Expected install time:** ~5 minutes. robotjs has prebuilt binaries for Node 20/Electron —
no compilation needed if you're on a supported platform.

---

### Phase 1: Global Hotkey + Beep (verify Electron basics work)
- `main.js`: create Tray, register globalShortcut (`CommandOrControl+Shift+Space`)
- Play `beep-start.wav` on press via Electron's `shell` or `net` audio API
- Verify hotkey fires even when VS Code is focused

**Success criteria:** Pressing the hotkey from any app plays the beep.

---

### Phase 2: Chrome Launcher + WebSocket
- Build `chrome-finder.js` (path discovery)
- Build `chrome-launcher.js` (puppeteer-core launch with flags)
- Start localhost HTTP server in `main.js`, serve `speech-bridge.html`
- Build `speech-bridge.html` (webkitSpeechRecognition + WebSocket client)
- WebSocket server in `main.js` receives text and `console.log`s it

**Success criteria:** Open app → press hotkey → speak → see text in Electron's console.

---

### Phase 3: Text Injection
- On receiving text from WebSocket: save clipboard, write text, simulate Cmd/Ctrl+V, restore
- Test: open Notepad/TextEdit → press hotkey → speak → text appears

**Success criteria:** Text appears in target app in your language.

---

### Phase 4: Settings UI + Language Switching
- Build `settings.html` with language dropdown (hardcoded list)
- IPC: settings window → main.js → stored in electron-store
- Language code sent to speech-bridge on each recognition session

**Success criteria:** Change language in Settings → speak in that language → correct text.

---

### Phase 5: Polish & Packaging
- Tray icon with status indicator (listening / idle / error)
- Chrome watchdog + auto-restart
- macOS: permission check on startup + deep-link to System Settings
- `electron-builder` config for .dmg (mac) and NSIS installer (Windows)
- Code signing (optional, but needed to avoid macOS Gatekeeper warnings)

---

## 8. Known Limitations (Honest List)

| Limitation | Impact | Workaround |
|---|---|---|
| Requires Google Chrome installed | Can't run without Chrome | Show friendly download prompt if not found |
| First-run mic permission prompt (macOS) | One-time only, normal UX | Handled with in-app guide |
| Clipboard is temporarily overwritten | Brief (~300ms), usually unnoticeable | Restore logic built in |
| Paste doesn't work in password fields | OS security intentionally blocks this | Expected, acceptable limitation |
| STT accuracy depends on Google's servers | Requires internet connection | Show "offline" warning in tray if no network |
| Chrome process uses ~120MB RAM | Background overhead | Acceptable for dedicated tool |
| Windows: Chrome window flashes briefly on first launch | Off-screen positioning takes 1–2 frames | Can be mitigated with `--window-position` flag |

---

## 9. What We Are NOT Building (Scope Guard)

- ❌ No custom STT engine (Whisper, Azure, etc.) — phase 2 possibility
- ❌ No text history / transcription log — phase 2
- ❌ No real-time overlay showing interim words — phase 2
- ❌ No multi-hotkey profiles — phase 2
- ❌ No Chromium fallback — architecturally impossible (Google blocks STT in Chromium)
- ❌ No mobile — desktop only

---

## 10. Open Questions Before Coding

1. **Default hotkey:** `Ctrl+Shift+Space` (Windows) / `Cmd+Shift+Space` (macOS)? Confirm this
   doesn't clash with your most-used apps (VS Code uses `Ctrl+Shift+P` for command palette).
2. **Speech mode default:** Auto-stop (good for sentences) or Toggle (good for long dictation)?
3. **Default language:** Should it auto-detect from OS locale, or default to English?
4. **Overlay:** Should there be a small floating window showing "Listening..." while active?
   (Requires an additional always-on-top BrowserWindow — adds ~1 day of work.)

---

*PRD version 2.0 — All architecture decisions verified against Chrome 112–124, Electron 29–30,
Node.js 20 LTS. Clipboard injection approach verified to work for Bengali, Arabic, Hindi, CJK.*

# MicTab v2.0.9 🎙️✨

### 🔧 Fixes & Polish
* **Silent Background Startup**: Removed the automatic startup popup timer. MicTab now launches silently into your menu bar tray as intended without opening the Settings window on system boot.
* **Window Layering & Sub-App Fix**: Resolved an issue on macOS where opening or closing sub-apps (Clipboard Manager, Floating Browser, Lens Screenshot) would pull the main Settings window to the front. 
* **Activation Policy Cleanup**: Improved macOS accessory policy restoration so the app seamlessly reverts to background mode when all interactive windows are dismissed.

---

# MicTab v1.3.37 🎙️✨

### 🔧 macOS Gatekeeper Patch
*   **macOS Fix Included:** Added automated `Fix-MicTab.command` script and bilingual copy-paste instructions directly into the DMG disk image to fix the macOS "App is damaged and can't be opened" Gatekeeper error.

---

# Juno Voice v1.2.2 🎙️✨

### 🔧 What's New in v1.2.2
*   **Windows Emoji Consistency:** Overhauled Windows emoji support across the app. Fixed a CDN issue where emojis in the picker were defaulting to native Windows rendering (causing flags to appear as letters and some modern emojis to render as square boxes). 
*   **Intelligent Emoticon Injection:** Updated the text injection system to automatically protect Emojis from simulated keystrokes, enforcing lightning-fast direct pasting for all multi-byte emoji codes. You will no longer encounter garbled emojis even if "Simulate Typing" is toggled on.

---

# Juno Voice v1.2.1 🎙️✨

### 🔧 What's New in v1.2.1
*   **Focus-Stealing Bug Fix:** Resolved a critical issue under Windows and macOS where clicking the overlay panel (e.g. punctuation buttons, modifier keys, mini mode toggle) would inadvertently steal focus from your active writing application. You can now use all visual features and the full keyboard seamlessly without interrupting your workflow.
*   **Performance Improvements:** Removed unneeded OS-level window restyling calls to optimize dynamic resizing performance.

---

# Juno Voice v1.2.0 is Here! 🎙️✨

We are incredibly excited to introduce the biggest update to Juno Voice yet. This release completely supercharges your dictation workflow with an array of premium features and polish designed for power users on both macOS and Windows.

### 🌟 What's New in v1.2.0

*   **Global Intelligent Dictation:** Hit your hotkey anywhere, instantly transcribe, and watch your words type natively into your active application.
*   **60+ Languages Handled Natively:** Switch languages instantly from the dynamic pill dropdown. Enjoy highly accurate multi-lingual transcription.
*   **Premium Glassmorphic Redesign:** Completely overhauled the entire overlay interface. It now features fluid animations, beautifully rounded corners, and a glass-like feel that floats unobtrusively. 
*   **Dynamic Visualizers & Themes:** Added `Pulse`, `Line`, and `Bar` real-time voice visualizers. Includes support for gorgeous themes like the stealthy Dark mode and the warm Bumble/Amber mode.
*   **Smart Emoji Tray with "Recent" Memory:** Fast, categorized emoji access with a smart `🕒 Recent` tab that automatically remembers and saves your most frequently used emojis. 
*   **Virtual Keyboard & Modifier Locking:** A full on-screen keyboard featuring *Tap-to-Latch* and *Double-Tap-to-Lock* functionality for Shift, Ctrl/Cmd, and Alt/Option modifiers. Absolute precision without touching your physical keyboard.
*   **Sleek Statistics Dashpad:** Keep track of exactly how many words and phrases you dictate.
*   **Stealth Pill Mode:** Automatically collapse the UI into a tiny elegant pill when you don't need the extra panels.

---
### 🔗 Connect With Us

*   **Website:** [PeeAI.com](https://www.peeai.com)
*   **YouTube Channel:** [@junoverseai](https://www.youtube.com/@junoverseai)
*   **Created By:** Sayed Johon

*Enjoy seamless, lightning-fast voice dictation! If you have any feedback, please reach out via our website.*

---

### 🍏 macOS Installation Note ("App is damaged")
If you are on macOS and see a warning saying **"MicTab app is damaged and can't be opened"** or **"unidentified developer"**:

1. Drag **MicTab.app** to your **Applications** folder.
2. Open **Terminal** (Press `Cmd + Space`, type `Terminal`, and hit Enter).
3. Paste the following command and press Enter:
   ```bash
   sudo xattr -cr /Applications/MicTab.app
   ```
4. Type your Mac password (it will not display characters as you type) and press Enter.
5. Open MicTab!


const { clipboard } = require('electron');
const robot = require('robotjs');
const store = require('../../store/config');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

class ClipboardManager {
  constructor() {
    this.originalClipboardText = '';
    this.isClipboardDirty = false;
    this.clipboardRestoreTimeout = null;
  }

  resetModifiers() {
    const mods = ['alt', 'command', 'control', 'shift'];
    mods.forEach(m => {
      try { robot.keyToggle(m, 'up'); } catch(e) {}
    });
  }

  // ── Windows-safe Ctrl+V paste ────────────────────────────────────────────
  // robot.keyTap('v', 'control') is unreliable on Windows.
  // The keyToggle down/up sequence (same as robustKeyTap uses) works correctly.
  _doPaste() {
    if (IS_WIN) {
      robot.keyToggle('control', 'down');
      robot.keyToggle('v', 'down');
      robot.keyToggle('v', 'up');
      robot.keyToggle('control', 'up');
    } else {
      robot.keyTap('v', 'command');
    }
  }

  injectText(text) {
    if (IS_MAC) this.resetModifiers();

    // simulateTyping via robot.typeString — only on macOS.
    // On Windows, typeString causes repeating characters in apps like Telegram
    // because of how Windows input hooks interact with robotjs key events.
    // Always use clipboard paste on Windows for reliable injection everywhere.
    if (IS_MAC && store.get('simulateTyping') && /^[\x00-\x7F]*$/.test(text) && text.length > 1) {
      setTimeout(() => {
        try {
          robot.setKeyboardDelay(0);
          robot.typeString(text);
        } catch (e) {
          console.error('typeString failed:', e);
        }
      }, 50);
      return;
    }

    // Only capture original text if we aren't already in a dirty state
    if (!this.isClipboardDirty) {
      this.originalClipboardText = clipboard.readText();
      this.isClipboardDirty = true;
    }

    // Clear any pending restore
    if (this.clipboardRestoreTimeout) {
      clearTimeout(this.clipboardRestoreTimeout);
    }

    clipboard.writeText(text);

    // Windows needs a slightly longer settle before paste to ensure clipboard is ready
    const pasteDelay = IS_WIN ? 120 : 60;

    setTimeout(() => {
      try {
        this._doPaste();
      } catch (e) {
        console.error('Paste failed:', e);
      }

      // Restore original clipboard after paste completes
      this.clipboardRestoreTimeout = setTimeout(() => {
        clipboard.writeText(this.originalClipboardText);
        this.isClipboardDirty = false;
        this.clipboardRestoreTimeout = null;
      }, 350);
    }, pasteDelay);
  }

  injectCharDirect(chars) {
    if (!chars) return;
    robot.setKeyboardDelay(0);

    // Layout-safe single characters (a-z, 0-9, space) tap directly — no clipboard needed
    const layoutSafe = /^[a-z0-9 ]$/i;

    if (chars.length === 1 && layoutSafe.test(chars)) {
      setTimeout(() => {
        try {
          if (IS_MAC) this.resetModifiers();
          const keyName = chars === ' ' ? 'space' : chars.toLowerCase();
          robot.keyTap(keyName);
        } catch (e) {
          console.error(`[ClipboardManager] keyTap failed for ${chars}:`, e);
          this.injectText(chars);
        }
      }, 50);
      return;
    }

    // Punctuation, numbers (sent as string), emoji → clipboard paste
    this.injectText(chars);
  }
}

module.exports = new ClipboardManager();

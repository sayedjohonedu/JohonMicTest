const { clipboard } = require('electron');
const robot = require('@hurdlegroup/robotjs');
const store = require('../../store/config');
const clipboardMonitor = require('./clipboard-monitor');

class ClipboardManager {
  constructor() {
    this.originalClipboardText = '';
    this.isClipboardDirty = false;
    this.clipboardRestoreTimeout = null;
    this.isPasting = false;
    this._pastingSafetyTimeout = null;
  }

  resetModifiers() {
    const isWin = process.platform === 'win32';
    // On Windows, 'command' is invalid in robotjs. Use platform-appropriate modifiers.
    const mods = isWin ? ['control', 'alt', 'shift'] : ['command', 'alt', 'control', 'shift'];
    mods.forEach(m => {
      try { robot.keyToggle(m, 'up'); } catch (_) {}
    });
  }

  /**
   * injectText(text, options)
   * options.deselect = true  →  deselect active selection first, then add 2
   *                             blank lines before pasting, so the AI output
   *                             never replaces what the user had highlighted.
   */
  injectText(text, options = {}) {
    if (text === undefined || text === null) return;

    // Safety lock: ensure isPasting can never stay stuck true
    this.isPasting = true;
    if (this._pastingSafetyTimeout) clearTimeout(this._pastingSafetyTimeout);
    this._pastingSafetyTimeout = setTimeout(() => {
      this.isPasting = false;
      this._pastingSafetyTimeout = null;
    }, 400);

    // Release any held modifiers before injecting
    this.resetModifiers();

    // ── Deselect-first mode (used when selected-text block fired) ──────────
    if (options.deselect) {
      try {
        if (process.platform === 'win32') {
          robot.keyToggle('right', 'down');
          setTimeout(() => {
            try { robot.keyToggle('right', 'up'); } catch (_) {}
          }, 20);
        } else {
          robot.keyTap('right'); // collapses selection → cursor at end of selection
        }
      } catch (e) {
        console.warn('[ClipboardManager] deselect key failed:', e.message);
      }
      // Prepend 2 newlines so output appears below the original text
      text = '\n\n' + text;
    }

    // simulateTyping via robot.typeString (macOS only)
    if (options.deselect) {
      // Fall through to clipboard paste below
    } else if (process.platform !== 'win32' && store.get('simulateTyping') && /^[\x00-\x7F]*$/.test(text) && text.length > 1) {
      setTimeout(() => {
        try {
          robot.setKeyboardDelay(0);
          robot.typeString(text);
        } catch (e) {
          console.error('typeString failed:', e);
        } finally {
          this.isPasting = false;
        }
      }, 50);
      return;
    }

    // Only capture original clipboard if we aren't already in a dirty state
    if (!this.isClipboardDirty) {
      try {
        this.originalClipboardText = clipboard.readText() || '';
        this.isClipboardDirty = true;
      } catch (_) {
        this.originalClipboardText = '';
      }
    }

    // Clear any pending restore since we have fresh text to paste
    if (this.clipboardRestoreTimeout) {
      clearTimeout(this.clipboardRestoreTimeout);
      this.clipboardRestoreTimeout = null;
    }

    // Write text to clipboard and suppress monitor from logging it
    clipboard.writeText(text);
    clipboardMonitor.suppressNext(text);

    // Delay before triggering paste shortcut
    // Windows requires ~70ms for OS clipboard buffer to settle across processes
    const pasteDelay = process.platform === 'win32' ? 70 : 40;

    setTimeout(() => {
      try {
        if (process.platform === 'win32') {
          // Windows: Micro-delay between modifier down and key down ensures
          // the target window's message queue registers VK_CONTROL before VK_V.
          robot.setKeyboardDelay(5);
          robot.keyToggle('control', 'down');
          setTimeout(() => {
            try {
              robot.keyToggle('v', 'down');
              setTimeout(() => {
                try {
                  robot.keyToggle('v', 'up');
                } catch (_) {}
                try {
                  robot.keyToggle('control', 'up');
                } catch (_) {}
                // Clear isPasting flag shortly after key release
                setTimeout(() => {
                  this.isPasting = false;
                }, 40);
              }, 20);
            } catch (err) {
              try { robot.keyToggle('control', 'up'); } catch (_) {}
              this.isPasting = false;
            }
          }, 20);
        } else {
          // macOS: native Cmd+V
          robot.keyTap('v', 'command');
          setTimeout(() => {
            this.isPasting = false;
          }, 30);
        }
      } catch (e) {
        console.error('[ClipboardManager] Paste execution error:', e);
        this.isPasting = false;
      }

      // Schedule clipboard restoration after target app has had ample time to read it.
      // Debounced so rapid speech recognition phrases don't restore mid-sentence.
      this.clipboardRestoreTimeout = setTimeout(() => {
        try {
          if (this.isClipboardDirty) {
            clipboardMonitor.suppressNext(this.originalClipboardText);
            clipboard.writeText(this.originalClipboardText);
            this.isClipboardDirty = false;
          }
        } catch (_) {}
        this.isPasting = false;
        this.clipboardRestoreTimeout = null;
      }, process.platform === 'win32' ? 750 : 500);
    }, pasteDelay);
  }

  injectCharDirect(chars) {
    if (!chars) return;
    robot.setKeyboardDelay(0);

    // Layout-safe characters that can be reliably typed with keyTap
    const layoutSafe = /^[a-z0-9 ]$/i;

    if (chars.length === 1 && layoutSafe.test(chars)) {
      setTimeout(() => {
        try {
          this.resetModifiers();
          const keyName = chars === ' ' ? 'space' : chars.toLowerCase();
          robot.keyTap(keyName);
        } catch (e) {
          console.error(`[ClipboardManager] keyTap failed for ${chars}:`, e);
          this.injectText(chars);
        }
      }, 40);
      return;
    }

    // For all punctuation, special symbols, emoji → robust clipboard paste
    this.injectText(chars);
  }
}

module.exports = new ClipboardManager();

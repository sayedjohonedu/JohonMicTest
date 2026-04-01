const { clipboard } = require('electron');
const robot = require('robotjs');
const store = require('../../store/config');

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

  injectText(text) {
    if (process.platform === 'darwin') this.resetModifiers();

    if (store.get('simulateTyping') && /^[\x00-\x7F]*$/.test(text) && text.length > 1) {
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

    const pasteDelay = process.platform === 'darwin' ? 60 : 100;
    const KBD_MOD = process.platform === 'darwin' ? 'command' : 'control';

    setTimeout(() => {
      try {
        robot.keyTap('v', KBD_MOD);
      } catch (e) {
        console.error('Paste failed:', e);
      }

      // Schedule restoration after paste has time to complete
      this.clipboardRestoreTimeout = setTimeout(() => {
        clipboard.writeText(this.originalClipboardText);
        this.isClipboardDirty = false;
        this.clipboardRestoreTimeout = null;
      }, 300);
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
          if (process.platform === 'darwin') this.resetModifiers();
          const keyName = chars === ' ' ? 'space' : chars.toLowerCase();
          robot.keyTap(keyName);
        } catch (e) {
          console.error(`[ClipboardManager] keyTap failed for ${chars}:`, e);
          this.injectText(chars);
        }
      }, 50);
      return;
    }

    // For all punctuation and special symbols, use robust clipboard paste
    this.injectText(chars);
  }
}

module.exports = new ClipboardManager();
